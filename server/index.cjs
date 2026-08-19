const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');
const { exec } = require('child_process');
const util = require('util');
const multer = require('multer');
const {
  findOversizedFiles,
  getUnpublishedStatus,
  undoUnpublishedCommits,
} = require('./gitSafety.cjs');

const execPromise = util.promisify(exec);
const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const projectsFilePath = path.join(__dirname, '..', 'public', 'data', 'projects.json');
const themeFilePath = path.join(__dirname, '..', 'public', 'data', 'theme.json');
const contentDirectory = path.join(__dirname, '..', 'public', 'content');
const git = simpleGit(path.join(__dirname, '..'));
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.png', '.jpg', '.jpeg', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg', 'image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_THEME_PRESETS = new Set(['midnight-violet', 'deep-ocean', 'ember-night']);

// --- НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ (MULTER) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Сохраняем прямо в папку public/content/
    cb(null, path.join(__dirname, '..', 'public', 'content'));
  },
  filename: function (req, file, cb) {
    const safeName = path.basename(file.originalname).replace(/\s+/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    cb(null, true);
  },
});

// Эндпоинт для загрузки медиа
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Файл больше 100 МБ.'
        : 'Поддерживаются только MP4, WebM, OGG, PNG, JPG и WebP.';
      return res.status(400).json({ message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Файл не найден' });
    }
    res.json({ filename: req.file.filename, message: 'Файл успешно загружен!' });
  });
});
// ------------------------------------------

app.get('/api/projects', async (req, res) => {
  try {
    const data = await fs.readFile(projectsFilePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ message: 'Error reading projects file' });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const newProjects = req.body;
    await fs.writeFile(projectsFilePath, JSON.stringify(newProjects, null, 2), 'utf-8');
    res.json({ message: 'Projects saved successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Error writing projects file' });
  }
});

app.get('/api/theme', async (req, res) => {
  try {
    const data = await fs.readFile(themeFilePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ message: 'Error reading theme file' });
  }
});

app.post('/api/theme', async (req, res) => {
  try {
    if (!ALLOWED_THEME_PRESETS.has(req.body?.preset)) {
      return res.status(400).json({ message: 'Неизвестная цветовая схема.' });
    }
    await fs.writeFile(themeFilePath, JSON.stringify({ preset: req.body.preset }, null, 2), 'utf-8');
    res.json({ message: 'Theme saved successfully!' });
  } catch (error) {
    res.status(500).json({ message: 'Error writing theme file' });
  }
});

app.post('/api/publish', async (req, res) => {
  try {
    const oversizedFiles = await findOversizedFiles(contentDirectory);
    if (oversizedFiles.length > 0) {
      return res.status(413).json({
        message: 'Публикация остановлена: найдены файлы больше 100 МБ.',
        files: oversizedFiles.map((file) => ({
          name: file.name,
          sizeMb: (file.sizeBytes / 1024 / 1024).toFixed(2),
        })),
      });
    }

    await git.add(['public/data/projects.json', 'public/data/theme.json', 'public/content']);
    const status = await git.status();
    if (status.staged.length > 0) {
      const message = req.body?.message || 'Update portfolio content via admin panel';
      await git.commit(message);
    }
    await git.push();
    
    console.log('Начинаю сборку и деплой на GitHub Pages...');
    const { stdout, stderr } = await execPromise('npm run deploy');
    console.log('Деплой завершен:\n', stdout);
    if (stderr) console.error('Предупреждения деплоя:\n', stderr);

    res.json({ message: 'Опубликовано успешно! Исходники сохранены, сайт обновлен.' });
  } catch (error) {
    console.error('Ошибка при публикации:', error);
    res.status(500).json({ message: 'Failed to publish', error: error.message || error });
  }
});

app.get('/api/git-status', async (req, res) => {
  try {
    res.json(await getUnpublishedStatus(git));
  } catch (error) {
    console.error('Ошибка проверки Git:', error);
    res.status(500).json({ message: 'Не удалось проверить состояние Git.', error: error.message || error });
  }
});

app.post('/api/undo-unpublished', async (req, res) => {
  try {
    const result = await undoUnpublishedCommits(git);
    res.json({
      ...result,
      message: result.undoneCommits > 0
        ? `Отменено неопубликованных коммитов: ${result.undoneCommits}. Файлы сохранены на диске.`
        : 'Неопубликованных коммитов нет.',
    });
  } catch (error) {
    console.error('Ошибка отмены коммитов:', error);
    res.status(409).json({ message: error.message || 'Не удалось отменить коммиты.' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Admin server is running at http://localhost:${port}`);
});
