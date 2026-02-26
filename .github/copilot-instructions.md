# AI Agent Instructions for Portfolio Project

## Project Overview
This is a React-based portfolio website built with TypeScript and Vite, featuring bilingual support (English/Russian) and a responsive design. The project uses Tailwind CSS for styling.

## Key Architecture Patterns

### Language System
- Language handling uses React Context (`context/LanguageContext.tsx`)
- Translations are stored in separate files under `locales/` (en.ts, ru.ts)
- The `useTranslations` hook (`hooks/useTranslations.ts`) provides access to translations throughout the app
- Language switching is managed through the `LanguageSwitcher` component

### Component Structure
- Main layout and routing handled in `App.tsx`
- Core components:
  - `Header.tsx`: Navigation and branding
  - `About.tsx`: Developer information
  - `Portfolio.tsx`: Project showcase
  - `Contact.tsx`: Contact information
  - `ProjectModal.tsx`: Project details modal

### Data Flow
- Project data is initialized from `data/initialProjects.ts`
- Language state is managed globally through LanguageContext
- Components access translations via the `useTranslations` hook

## Development Workflow

### Setup
```bash
npm install  # Install dependencies
npm run dev  # Start development server
```

### Conventions
1. Component Organization:
   - UI components go in `components/`
   - Icons have dedicated components in `components/icons/`
   - Hooks are in `hooks/`
   - Context providers in `context/`

2. Translation Pattern:
   ```typescript
   const { t, language } = useTranslations();
   // Usage: t.sectionName.stringKey
   ```

3. File Structure:
   - Component files use PascalCase (.tsx)
   - Utility files use camelCase (.ts)
   - Each component should have its translations in both language files

## Common Tasks
- Adding new strings: Add keys to both `locales/en.ts` and `locales/ru.ts`
- Creating new components: Follow the existing pattern of importing useTranslations and accessing via `t`
- Adding projects: Update `data/initialProjects.ts` following the existing structure

## Important Notes
- Always wrap components needing translations in the LanguageProvider
- Content images should be placed in `public/content/`
- Follow the established bilingual pattern for any new text content