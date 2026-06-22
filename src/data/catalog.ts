export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  category: string;
  tags: string[];
};

export type CatalogSection = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  products: CatalogProduct[];
};

export const catalogData: { sections: CatalogSection[] } = {
  sections: [
    {
      slug: 'grill',
      eyebrow: 'Огонь и угли',
      title: 'Мангал',
      description: 'Быстрый старт для мясного меню с понятными локальными данными.',
      products: [
        {
          id: 'shashlik-lamb',
          name: 'Шашлык из баранины',
          description: 'Сочный шашлык с луком, зеленью и соусом на выбор.',
          price: 4200,
          available: true,
          category: 'Мангал',
          tags: ['хит', 'мясо', 'огонь']
        },
        {
          id: 'beef-kebab',
          name: 'Люля-кебаб из говядины',
          description: 'Плотная текстура, дымный аромат и тонкий лаваш в комплекте.',
          price: 3600,
          available: true,
          category: 'Мангал',
          tags: ['кебаб', 'лавaш', 'ужин']
        },
        {
          id: 'grilled-vegetables',
          name: 'Овощи на гриле',
          description: 'Перец, томаты, баклажан и кабачок с чесночным маслом.',
          price: 2400,
          available: false,
          category: 'Мангал',
          tags: ['овощи', 'гарнир', 'легко']
        }
      ]
    },
    {
      slug: 'dough',
      eyebrow: 'Тесто и пар',
      title: 'Восточная классика',
      description: 'Позиции, на которых можно проверить карточки, фильтры и поиск.',
      products: [
        {
          id: 'manty',
          name: 'Манты',
          description: 'Домашние манты с мясной начинкой и сметанным соусом.',
          price: 2800,
          available: true,
          category: 'Тесто',
          tags: ['пар', 'домашнее', 'традиция']
        },
        {
          id: 'lagman',
          name: 'Лагман',
          description: 'Наваристый бульон, лапша ручной вытяжки и овощи.',
          price: 3100,
          available: true,
          category: 'Супы',
          tags: ['суп', 'лапша', 'сытно']
        },
        {
          id: 'samsa',
          name: 'Самса из тандыра',
          description: 'Слоёное тесто, рубленое мясо и хрустящая корочка.',
          price: 1600,
          available: true,
          category: 'Выпечка',
          tags: ['тандыр', 'хруст', 'перекус']
        }
      ]
    },
    {
      slug: 'drinks',
      eyebrow: 'Освежиться',
      title: 'Напитки',
      description: 'Небольшой раздел, чтобы страница выглядела законченной уже сейчас.',
      products: [
        {
          id: 'lemonade',
          name: 'Домашний лимонад',
          description: 'Лимон, мята и лёгкая газировка без лишней сладости.',
          price: 1200,
          available: true,
          category: 'Напитки',
          tags: ['мята', 'холодный', 'лето']
        },
        {
          id: 'tea',
          name: 'Чайник чая',
          description: 'Чёрный или зелёный чай на выбор, подаётся в чайнике.',
          price: 1400,
          available: true,
          category: 'Напитки',
          tags: ['чай', 'горячий', 'классика']
        }
      ]
    }
  ]
};
