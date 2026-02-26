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

export interface Project {
  id: number;
  order: number; // <-- Добавили это поле для сортировки
  title: {
    ru: string;
    en: string;
  };
  description: {
    ru: string;
    en: string;
  };
  mediaFile: string;
  tags: string[];
}