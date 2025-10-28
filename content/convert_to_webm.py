import subprocess
from pathlib import Path

# Путь к ffmpeg.exe
FFMPEG = r"C:\Progra~1\ffmpeg-2025-10-27-git-68152978b5-essentials_build\bin\ffmpeg.exe"

# Папка с mp4
input_folder = Path(".")
output_folder = input_folder / "webm"
output_folder.mkdir(exist_ok=True)

for mp4_file in input_folder.glob("*.mp4"):
    filename = mp4_file.stem
    out_file = output_folder / f"{filename}.webm"
    counter = 1

    # Если файл существует, создаём уникальное имя
    while out_file.exists():
        out_file = output_folder / f"{filename}_{counter}.webm"
        counter += 1

    print(f"Конвертация {mp4_file.name} -> {out_file.name}")
    subprocess.run([
        FFMPEG,
        "-y",  # автоматическая перезапись
        "-i", str(mp4_file),
        "-c:v", "libvpx-vp9",
        "-b:v", "1M",
        "-c:a", "libopus",
        str(out_file)
    ])
print("Все конвертации завершены!")
