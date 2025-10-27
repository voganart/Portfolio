import type { Project } from '../types';

// Совет: Замените эти данные на свои реальные проекты.
// Файлы (картинки/видео) должны лежать в папке /content/
export const initialProjects: Project[] = [
  {
    id: 1,
    title: {
      ru: 'БАБА ЛИДА СПЭЛЛ',
      en: '3D Character "Cat Student"',
    },
    description: {
      ru: 'Стилизованная 3D модель персонажа-кота, готового к учебе с рюкзаком.',
      en: 'A stylized 3D model of a cat character ready for school with a backpack.',
    },
    mediaFile: './content/25.png', // Пример: файл лежит в /content/cat-student-1.png
    tags: ['3D Modeling', 'Character Art', 'Blender'],
  },
  {
    id: 2,
    title: {
      ru: 'Стилизованный портрет персонажа',
      en: 'Stylized Character Portrait',
    },
    description: {
      ru: 'Бюст дружелюбного стилизованного мужского персонажа.',
      en: 'A friendly-looking stylized male character bust.',
    },
    mediaFile: './content/icon_cat_match3-win_1.mp4',
    tags: ['3D Modeling', 'Character Art', 'ZBrush'],
  },
  {
    id: 3,
    title: {
      ru: 'Кот-студент - Рендер в полный рост',
      en: 'Cat Student - Full Body Render',
    },
    description: {
      ru: 'Рендер персонажа-кота в полный рост на отражающей поверхности.',
      en: 'A full-body render of the cat student character on a reflective surface.',
    },
    mediaFile: 'cat-student-2.png',
    tags: ['3D Modeling', 'Rendering', 'Blender'],
  },
  {
    id: 4,
    title: {
      ru: 'Анимация существа "Грифон"',
      en: 'Creature Animation "Gryphon"',
    },
    description: {
      ru: 'Анимации полета, атаки и idle-циклы для мифического существа в Unity.',
      en: 'Flight, attack, and idle loop animations for a mythical creature in Unity.',
    },
    mediaFile: 'griffon.jpg',
    tags: ['Animation', 'Unity', 'Creature'],
  },
  {
    id: 5,
    title: {
      ru: 'Риггинг и скиннинг "Кибер-солдат"',
      en: 'Rigging & Skinning "Cyber-Soldier"',
    },
    description: {
      ru: 'Создание рига для сложного гуманоидного персонажа с механическими частями.',
      en: 'Creating a rig for a complex humanoid character with mechanical parts.',
    },
    mediaFile: 'cybersoldier.jpg',
    tags: ['Rigging', 'Skinning', 'Maya'],
  },
  {
    id: 6,
    title: {
      ru: 'Ассет "Сундук с сокровищами"',
      en: 'Asset "Treasure Chest"',
    },
    description: {
      ru: 'Стилизованная модель с PBR-текстурами и анимацией открытия.',
      en: 'Stylized model with PBR textures and opening animation.',
    },
    mediaFile: 'chest.jpg',
    tags: ['Modeling', 'ZBrush', 'Animation'],
  },
  {
    id: 7,
    title: {
      ru: 'Spine 2D Анимация - Рыцарь',
      en: 'Spine 2D Animation - Knight',
    },
    description: {
      ru: 'Анимации атаки и бега для 2D персонажа-рыцаря в Spine.',
      en: 'Attack and run cycle animations for a 2D knight character in Spine.',
    },
    mediaFile: 'knight.jpg',
    tags: ['2D Animation', 'Spine', 'Character'],
  },
  {
    id: 8,
    title: {
      ru: 'Godot VFX - Огненный шар',
      en: 'Godot VFX - Fireball',
    },
    description: {
      ru: 'Визуальный эффект для заклинания огненного шара, созданный в Godot Engine.',
      en: 'Visual effect for a fireball spell created directly in Godot Engine.',
    },
    mediaFile: 'fireball.jpg',
    tags: ['VFX', 'Godot', 'Shaders'],
  },
  {
    id: 9,
    title: {
      ru: 'Набор Low-Poly Окружения',
      en: 'Low-Poly Environment Pack',
    },
    description: {
      ru: 'Набор low-poly ассетов для создания стилизованного лесного окружения.',
      en: 'A set of low-poly assets for creating a stylized forest environment.',
    },
    mediaFile: 'forestpack.jpg',
    tags: ['3D Modeling', 'Environment Art', 'Blender'],
  },
  {
    id: 10,
    title: {
      ru: 'Модель Sci-Fi Оружия',
      en: 'Sci-Fi Weapon Model',
    },
    description: {
      ru: 'High-poly концепт футуристической плазменной винтовки, рендер в Blender Cycles.',
      en: 'A high-poly concept of a futuristic plasma rifle, rendered in Blender Cycles.',
    },
    mediaFile: 'scifiweapon.jpg',
    tags: ['Hard Surface', 'Modeling', 'Blender'],
  },
];
