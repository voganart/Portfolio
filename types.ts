
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
  tags: string[];
}
