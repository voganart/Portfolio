const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const simpleGit = require('simple-git');

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
    const status = await git.status();
    
    if (!status.isClean()) {
      // ИСПРАВЛЕНИЕ: Безопасное чтение req.body с помощью опциональной цепочки (?.)
      const message = req.body?.message || 'Update portfolio content via admin panel';
      await git.add('.');
      await git.commit(message);
    }

    await git.push();
    
    res.json({ message: status.isClean() ? 'Опубликовано! (Новых изменений не было)' : 'Опубликовано успешно!' });
  } catch (error) {
    console.error('Git error:', error);
    res.status(500).json({ message: 'Failed to publish', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Admin server is running at http://localhost:${port}`);
});