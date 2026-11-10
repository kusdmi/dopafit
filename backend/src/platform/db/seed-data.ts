export const catalogCategories = [
  { slug: "chest", name: "Грудь", emoji: "💪", position: 0 },
  { slug: "back", name: "Спина", emoji: "🔙", position: 1 },
  { slug: "legs", name: "Ноги", emoji: "🦵", position: 2 },
  { slug: "shoulders", name: "Плечи", emoji: "🤸", position: 3 },
  { slug: "arms", name: "Руки", emoji: "💪", position: 4 },
  { slug: "abs", name: "Пресс", emoji: "🔥", position: 5 },
];

interface CatalogExercise {
  category: string;
  name: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  alt_names: string[];
  description: string;
  steps: string[];
  contraindications: string | null;
}

export const catalogExercises: CatalogExercise[] = [
  {
    category: "chest",
    name: "Жим штанги лёжа",
    difficulty: "intermediate",
    alt_names: ["Bench press"],
    description: "Базовое упражнение для развития грудных мышц.",
    steps: ["Лягте на скамью", "Снимите штангу со стоек", "Опустите к груди", "Выжмите вверх"],
    contraindications: "Травмы плечевого сустава",
  },
  {
    category: "chest",
    name: "Отжимания от пола",
    difficulty: "beginner",
    alt_names: ["Push-ups"],
    description: "Универсальное упражнение с весом тела.",
    steps: ["Примите упор лёжа", "Опуститесь к полу", "Вернитесь в исходное положение"],
    contraindications: null,
  },
  {
    category: "chest",
    name: "Разведение гантелей",
    difficulty: "intermediate",
    alt_names: ["Dumbbell fly"],
    description: "Изолирующее упражнение на грудь.",
    steps: ["Лягте на скамью с гантелями", "Разведите руки в стороны", "Сведите над грудью"],
    contraindications: null,
  },
  {
    category: "back",
    name: "Подтягивания",
    difficulty: "advanced",
    alt_names: ["Pull-ups"],
    description: "Лучшее упражнение для широчайших мышц спины.",
    steps: ["Возьмитесь за перекладину", "Подтянитесь подбородком выше", "Опуститесь"],
    contraindications: null,
  },
  {
    category: "back",
    name: "Тяга штанги в наклоне",
    difficulty: "intermediate",
    alt_names: ["Barbell row"],
    description: "Развивает толщину спины.",
    steps: ["Наклонитесь со штангой", "Подтяните к поясу", "Опустите"],
    contraindications: "Травмы поясницы",
  },
  {
    category: "legs",
    name: "Приседания со штангой",
    difficulty: "intermediate",
    alt_names: ["Squat"],
    description: "Базовое упражнение для ног и ягодиц.",
    steps: ["Поставьте штангу на плечи", "Присядьте до параллели", "Встаньте"],
    contraindications: "Травмы коленей",
  },
  {
    category: "legs",
    name: "Выпады",
    difficulty: "beginner",
    alt_names: ["Lunges"],
    description: "Упражнение для ног и баланса.",
    steps: ["Сделайте шаг вперёд", "Опуститесь", "Вернитесь"],
    contraindications: null,
  },
  {
    category: "shoulders",
    name: "Жим гантелей сидя",
    difficulty: "intermediate",
    alt_names: ["Shoulder press"],
    description: "Развивает дельтовидные мышцы.",
    steps: ["Сядьте с гантелями у плеч", "Выжмите вверх", "Опустите"],
    contraindications: null,
  },
  {
    category: "arms",
    name: "Подъём штанги на бицепс",
    difficulty: "beginner",
    alt_names: ["Biceps curl"],
    description: "Изоляция бицепса.",
    steps: ["Возьмите штангу", "Согните руки", "Опустите"],
    contraindications: null,
  },
  {
    category: "arms",
    name: "Французский жим",
    difficulty: "intermediate",
    alt_names: ["Triceps extension"],
    description: "Изоляция трицепса.",
    steps: ["Лягте со штангой", "Опустите ко лбу", "Выпрямите руки"],
    contraindications: "Травмы локтя",
  },
  {
    category: "abs",
    name: "Скручивания",
    difficulty: "beginner",
    alt_names: ["Crunches"],
    description: "Базовое упражнение на пресс.",
    steps: ["Лягте на спину", "Поднимите корпус", "Опуститесь"],
    contraindications: null,
  },
  {
    category: "abs",
    name: "Планка",
    difficulty: "beginner",
    alt_names: ["Plank"],
    description: "Статическое упражнение на кор.",
    steps: ["Примите упор на предплечьях", "Держите тело прямым", "Удерживайте позицию"],
    contraindications: null,
  },
];

interface StandardProgram {
  name: string;
  kind: "strength" | "functional" | "cardio" | "plyometric";
  days: { name: string; exercises: [name: string, sets: number, reps: number][] }[];
}

export const standardPrograms: StandardProgram[] = [
  {
    name: "Силовая база",
    kind: "strength",
    days: [
      {
        name: "День 1 — верх",
        exercises: [
          ["Жим штанги лёжа", 4, 8],
          ["Подтягивания", 4, 8],
        ],
      },
      {
        name: "День 2 — низ",
        exercises: [
          ["Приседания со штангой", 4, 8],
          ["Выпады", 3, 12],
        ],
      },
    ],
  },
  {
    name: "Функциональная",
    kind: "functional",
    days: [
      {
        name: "Круговая",
        exercises: [
          ["Отжимания от пола", 3, 15],
          ["Планка", 3, 60],
          ["Выпады", 3, 12],
        ],
      },
    ],
  },
  {
    name: "Кардио",
    kind: "cardio",
    days: [
      {
        name: "Кардио-день",
        exercises: [
          ["Скручивания", 3, 20],
          ["Планка", 3, 45],
        ],
      },
    ],
  },
  {
    name: "Плиометрика",
    kind: "plyometric",
    days: [
      {
        name: "Взрывная",
        exercises: [
          ["Выпады", 4, 10],
          ["Отжимания от пола", 4, 12],
        ],
      },
    ],
  },
];

export const catalogEmbeds = [
  { exercise: "Жим штанги лёжа", url: "https://www.youtube.com/embed/rT7DgCr-3pg" },
];
