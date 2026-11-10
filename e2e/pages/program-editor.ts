import type { Locator, Page } from '@playwright/test';

import { expect } from '../fixtures/test.ts';
import { paths, programEdit } from '../support/paths.ts';

/** Reusable user actions on the program builder, with semantic controls only. */
export class ProgramEditor {
  constructor(readonly page: Page) {}

  async openNew(): Promise<void> {
    await this.page.goto(paths.programNew);
    await expect(this.page.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
  }

  async openExisting(id: string): Promise<void> {
    await this.page.goto(programEdit(id));
    await expect(this.page.getByRole('heading', { name: 'Редактировать' })).toBeVisible();
    await expect(this.page.getByPlaceholder('Название программы')).not.toHaveValue('');
  }

  async setName(name: string): Promise<void> {
    await this.page.getByPlaceholder('Название программы').fill(name);
  }

  async addDay(name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Добавить день' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByPlaceholder('Название дня').fill(name);
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(this.page.getByRole('heading', { name })).toBeVisible();
  }

  async renameDay(index: number, name: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Редактировать день' }).nth(index).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByPlaceholder('Название дня').fill(name);
    await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(this.page.getByRole('heading', { name })).toBeVisible();
  }

  async addExercise(
    dayIndex: number,
    name: string,
    sets: number,
    reps: number,
    primary?: string,
  ): Promise<void> {
    if (primary) {
      await this.slot(primary).getByRole('button', { name: '+ Добавить альтернативу' }).click();
    } else {
      await this.page.getByRole('button', { name: 'Добавить упражнение' }).nth(dayIndex).click();
    }
    const dialog = this.page.getByRole('dialog');
    // Pick the real catalog row so the server receives its exercise_id.
    await dialog.getByPlaceholder('Название упражнения').fill(name);
    await dialog.getByRole('button', { name, exact: true }).click();
    await dialog.getByPlaceholder('Подходы').fill(String(sets));
    await dialog.getByPlaceholder('Повторения').fill(String(reps));
    await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  slot(name: string): Locator {
    return this.page.getByRole('button', { name: `Переместить: ${name}` });
  }

  async dragBelow(sourceName: string, targetName: string): Promise<void> {
    const source = this.slot(sourceName);
    const target = this.slot(targetName);
    await target.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Program drag targets are not visible');
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + 15 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height - 5 };
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(start.x, start.y + 12);
    await expect(source).toHaveAttribute('style', /z-index: 1/);
    await this.page.mouse.move(end.x, end.y, { steps: 16 });
    await this.page.mouse.up();
    await this.waitForDrop();
  }

  async dragAbove(sourceName: string, targetName: string): Promise<void> {
    const source = this.slot(sourceName);
    const target = this.slot(targetName);
    await source.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Program drag targets are not visible');
    const start = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + 15 };
    const end = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + 5 };
    await this.page.mouse.move(start.x, start.y);
    await this.page.mouse.down();
    await this.page.mouse.move(start.x, start.y - 12);
    await expect(source).toHaveAttribute('style', /z-index: 1/);
    await this.page.mouse.move(end.x, end.y, { steps: 16 });
    await this.page.mouse.up();
    await this.waitForDrop();
  }

  async waitForDrop(): Promise<void> {
    // dnd-kit animates the moved rows after drop. Its click guard is cleared
    // during that transition; saving before it finishes can lose the click.
    await this.page.getByRole('button', { name: /^Переместить:/ }).evaluateAll(async (rows) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await Promise.all(
        rows.flatMap((row) =>
          row.getAnimations().map((animation) => animation.finished.catch(() => {})),
        ),
      );
    });
  }

  async save(method: 'POST' | 'PUT', id?: string): Promise<number> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) =>
          r.request().method() === method &&
          r.url().endsWith(id ? `/api/v1/programs/${id}` : '/api/v1/programs'),
      ),
      this.page.getByRole('button', { name: 'Сохранить программу' }).click(),
    ]);
    // The response can arrive before the app invalidates its cache and navigates.
    // A document navigation here would interrupt those save callbacks.
    if (response.ok()) await expect(this.page).toHaveURL(paths.programs);
    return response.status();
  }
}
