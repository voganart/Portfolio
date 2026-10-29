export type Tag = 
  | '2D Animation' 
  | '3D Animation' 
  | 'Blender' 
  | 'Spine' 
  | 'Unity' 
  | 'Godot' 
  | 'VFX' 
  | 'UI' 
  | 'Character' 
  | 'Environment' 
  | 'Showreel' 
  | 'Prototyping'
  | '3D Render'
  | 'Game Development'
  | 'Animator';

// es необязателен: если пусто, на сайте показывается en
export interface LocalizedText {
  ru: string;
  en: string;
  es?: string;
}

export interface Project {
  id: number;
  order: number; // <-- Добавили это поле для сортировки
  title: LocalizedText;
  description: LocalizedText;
  mediaFile: string;
  tags: string[];
  featured?: boolean; // показывать во вкладке «Избранное» на главной
  link?: string; // страница, которая открывается по клику вместо просмотра (например, браузерная игра), путь от корня сайта
}