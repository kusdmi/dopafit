import type { InputHTMLAttributes } from 'react';

/** Общий публичный API поля ввода. Потребители (формы, react-hook-form register)
 *  передают нативные атрибуты <input>; внутри они мостятся в IonInput. */
export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'label'> {
  label: string;
  error?: string;
  /** Скрыть кнопку-глаз у password-поля. Для второго поля пары «Пароль /
   *  Повторите пароль», где два глаза подряд смотрятся избыточно. */
  hidePasswordToggle?: boolean;
  /** Поле без собственной рамки и боковых отступов — когда оно уже лежит
   *  внутри чужой обводки и своя давала бы коробку в коробке. */
  bare?: boolean;
}
