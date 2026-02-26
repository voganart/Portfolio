const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');
const { exec } = require('child_process');
const util = require('util');
const multer = require('multer'); // Импортируем multer для загрузки файлов

const execPromise = util.promisify(exec);
const app = express();
const port = 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const projectsFilePath = path.join(__dirname, '..', 'public', 'data', 'projects.json');
const git = simpleGit();

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

app.listen(port, () => {
  console.log(`🚀 Admin server is running at http://localhost:${port}`);
});