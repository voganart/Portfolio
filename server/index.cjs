const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');
const { exec } = require('child_process'); // Модуль для запуска команд в терминале
const util = require('util');

const execPromise = util.promisify(exec); // Делаем exec удобным для async/await
const app = express();
const port = 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const projectsFilePath = path.join(__dirname, '..', 'public', 'data', 'projects.json');
const git = simpleGit();

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
    // 1. Сохраняем исходный код (как и раньше)
    const status = await git.status();
    if (!status.isClean()) {
      const message = req.body?.message || 'Update portfolio content via admin panel';
      await git.add('.');
      await git.commit(message);
    }
    await git.push(); // Пушим исходники в основную ветку
    
    // 2. Собираем проект и пушим на ветку gh-pages
    console.log('Начинаю сборку и деплой на GitHub Pages... (это займет секунд 15-30)');
    
    // Запускаем скрипт npm run deploy, который у тебя прописан в package.json
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