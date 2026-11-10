import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * iOS зумит страницу при фокусе поля, у которого font-size МЕНЬШЕ 16px, и
 * обратно пользователь его не отмотает: index.html запрещает масштабирование
 * (`user-scalable=no`, требование продукта «как нативное приложение»). То есть
 * одно поле с мелкой типографикой оставляет экран въехавшим до перезагрузки.
 *
 * Перехват `gesturestart` в index.html здесь НЕ помогает — он гасит пинч, а
 * автозум по фокусу это другой механизм.
 *
 * Проверка по ТЕКСТУ исходников, а не рендером: размер задаётся классом роли
 * (`.text-body-s` и т.п.), а его значение живёт в CSS, которого в jsdom нет —
 * сгенерированные Tailwind утилиты в тест не попадают, и getComputedStyle
 * вернул бы пустоту. Пороговые роли берутся из tokens.css, так что тест не
 * хранит собственную копию размеров: сделаешь `--text-body-s: 16px` —
 * роль сама уйдёт из списка запрещённых.
 */

const SRC = join(process.cwd(), 'src');

/** Роли типографики из tokens.css со значением МЕНЬШЕ 16px. */
function rolesUnder16px(): string[] {
  const tokens = readFileSync(join(SRC, 'app/styles/tokens.css'), 'utf8');
  const roles: string[] = [];
  for (const [, role, px] of tokens.matchAll(/--text-([a-z0-9-]+):\s*(\d+)px;/g)) {
    if (Number(px) < 16) roles.push(role);
  }
  return roles;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Разрезает файл на JSX-теги полей ввода. Границей служит первый `>` на
 * нулевой глубине вложенных `{…}`: атрибут вида `className={`${x} y`}` сам
 * содержит `>` внутри выражения, и наивный поиск `indexOf('>')` рвал бы тег
 * посередине.
 *
 * Комментарии из тега ВЫРЕЗАЮТСЯ, и это не косметика: комментарий рядом с
 * полем объясняет выбранную роль и называет её по имени («роль H3, а не Body
 * S»). Без вырезания тест ловил бы имя роли из прозы — поле с `text-body-s`
 * в классе и упоминанием `text-h3` в комментарии проходило бы проверку.
 */
function inputTags(source: string): string[] {
  const tags: string[] = [];
  for (const match of source.matchAll(/<(input|textarea|select)[\s>]/g)) {
    let depth = 0;
    let end = -1;
    for (let i = match.index!; i < source.length; i += 1) {
      const char = source[i];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    const tag = source.slice(match.index!, end === -1 ? source.length : end + 1);
    tags.push(tag.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  }
  return tags;
}

/** Поля, которые НЕ принимают текст с клавиатуры, зумить нечего. */
function isTextEntry(tag: string): boolean {
  if (/className="[^"]*\bsr-only\b/.test(tag)) return false;
  const type = /\btype="([a-z]+)"/.exec(tag)?.[1];
  return !(type && ['radio', 'checkbox', 'file', 'hidden', 'range', 'color'].includes(type));
}

describe('автозум iOS на полях ввода', () => {
  const roles = rolesUnder16px();

  it('берёт пороговые роли из tokens.css', () => {
    // Страховка от «зелёного пустого» теста: если регулярка перестанет
    // находить токены, список окажется пустым и проверка ниже пройдёт всегда.
    expect(roles).toContain('body-s');
    expect(roles).not.toContain('h3');
  });

  it('ни одно текстовое поле не набрано роли мельче 16px', () => {
    const banned = new RegExp(`\\btext-(${roles.join('|')})\\b`);
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const tag of inputTags(source)) {
        if (isTextEntry(tag) && banned.test(tag)) {
          offenders.push(`${relative(SRC, file)}: ${banned.exec(tag)![0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('невидимому полю OTP размер задан явно, а не наследуется от body', () => {
    // Особый случай: ячейки кода нарисованы <div>, а зумом управляет
    // растянутый поверх них прозрачный <input>. Без своей роли он наследовал
    // 14px от body, и экран въезжал на первом же касании при входе.
    const otp = readFileSync(join(SRC, 'shared/ui/OtpInput.tsx'), 'utf8');
    const tag = inputTags(otp).find((t) => t.includes('one-time-code'));
    expect(tag).toBeDefined();
    expect(tag).toMatch(/\btext-h3\b/);
  });
});
