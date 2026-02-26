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
  | '3D Render'; // Добавь другие по необходимости

export interface Project {
  id: number;
  title: {
    ru: string;
    en: string;
  };
  description: {
    ru: string;
    en: string;
  };
  mediaFile: string;
  tags: string[]; // Можно заменить на Tag[], если хочешь строгой проверки
}