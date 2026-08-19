const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');
const { exec } = require('child_process');
const util = require('util');
const multer = require('multer'); // Импортируем multer для загрузки файлов
const {
  findOversizedFiles,
  getUnpublishedStatus,
  undoUnpublishedCommits,
} = require('./gitSafety.cjs');

const execPromise = util.promisify(exec);
const app = express();
const port = 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const projectsFilePath = path.join(__dirname, '..', 'public', 'data', 'projects.json');
const contentDirectory = path.join(__dirname, '..', 'public', 'content');
const git = simpleGit(path.join(__dirname, '..'));

// --- НАСТРОЙКА ЗАГРУЗКИ ФАЙЛОВ (MULTER) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Сохраняем прямо в папку public/content/
    cb(null, path.join(__dirname, '..', 'public', 'content'));
  },
  filename: function (req, file, cb) {
    // Убираем пробелы из имени файла, чтобы не было проблем с URL
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage: storage });

// Эндпоинт для загрузки медиа
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Файл не найден' });
    }
    // Возвращаем имя сохраненного файла
    res.json({ filename: req.file.filename, message: 'Файл успешно загружен!' });
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    res.status(500).json({ message: 'Ошибка сервера при загрузке' });
  }
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

    const status = await git.status();
    if (!status.isClean()) {
      const message = req.body?.message || 'Update portfolio content via admin panel';
      await git.add('.');
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
