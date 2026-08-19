const fs = require('fs/promises');
const path = require('path');

const GITHUB_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

async function findOversizedFiles(directory, limitBytes = GITHUB_HARD_LIMIT_BYTES) {
  const oversized = [];

  async function visit(currentDirectory, relativeDirectory = '') {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(absolutePath);
        if (stats.size > limitBytes) {
          oversized.push({ name: relativePath, sizeBytes: stats.size });
        }
      }
    }
  }

  await visit(directory);
  return oversized.sort((a, b) => a.name.localeCompare(b.name));
}

async function getUnpublishedStatus(git) {
  const status = await git.status();
  return {
    ahead: status.ahead,
    behind: status.behind,
    tracking: status.tracking || null,
  };
}

async function undoUnpublishedCommits(git) {
  const status = await getUnpublishedStatus(git);

  if (!status.tracking) {
    throw new Error('У текущей ветки нет привязки к GitHub. Сброс отменён.');
  }
  if (status.behind > 0) {
    throw new Error('Локальная ветка отстаёт от GitHub. Сначала синхронизируйте репозиторий.');
  }
  if (status.ahead < 1) {
    return { undoneCommits: 0 };
  }

  await git.raw(['reset', '--mixed', status.tracking]);
  return { undoneCommits: status.ahead };
}

module.exports = {
  GITHUB_HARD_LIMIT_BYTES,
  findOversizedFiles,
  getUnpublishedStatus,
  undoUnpublishedCommits,
};
