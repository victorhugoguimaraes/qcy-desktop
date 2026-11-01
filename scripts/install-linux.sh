#!/usr/bin/env bash
set -euo pipefail
project_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
app_dir="${XDG_DATA_HOME:-$HOME/.local/share}/qcy-desktop"
mkdir -p "$app_dir"
exec 9>"$app_dir/update.lock"
flock -n 9 || { echo 'Outra instalação ou atualização está em andamento.' >&2; exit 1; }
echo 'Etapa 1/3: verificando testes e preparando a interface…'
cd "$project_dir"
npm run check
echo 'Etapa 2/3: compilando o aplicativo…'
cargo_bin="$(command -v cargo || true)"
[[ -n "$cargo_bin" ]] || cargo_bin="$HOME/.cargo/bin/cargo"
"$cargo_bin" build --release --features custom-protocol --manifest-path "$project_dir/src-tauri/Cargo.toml"
binary="$project_dir/src-tauri/target/release/qcy-desktop"
[[ -x "$binary" ]] || { echo 'Executável de produção não encontrado.' >&2; exit 1; }
echo 'Etapa 3/3: instalando aplicativo e atalhos…'
if [[ -f "$app_dir/qcy-desktop" ]]; then cp -p "$app_dir/qcy-desktop" "$app_dir/qcy-desktop.previous"; fi
install -m 755 "$binary" "$app_dir/.qcy-desktop.new.$$"
mv -f "$app_dir/.qcy-desktop.new.$$" "$app_dir/qcy-desktop"
python3 - "$project_dir" "$app_dir" <<'PY'
from pathlib import Path
import os,sys,shutil,subprocess
project,app=map(Path,sys.argv[1:]);data=Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))
icons=data/'icons/hicolor/128x128/apps';icons.mkdir(parents=True,exist_ok=True)
shutil.copy2(project/'src-tauri/icons/icon.png',icons/'io.qcydesktop.app.png')
apps=data/'applications';apps.mkdir(parents=True,exist_ok=True)
exe=str(app/'qcy-desktop')
for char in ['\\','"','`','$']:exe=exe.replace(char,'\\'+char)
text=f'''[Desktop Entry]
Type=Application
Name=QCY Desktop
Comment=Controle seus fones MeloBuds N50
Exec="{exe}"
Icon=io.qcydesktop.app
Terminal=false
Categories=AudioVideo;Audio;
StartupWMClass=QCY Desktop
StartupNotify=true
'''
desktop_file=apps/'io.qcydesktop.app.desktop';desktop_file.write_text(text)
try:
 desktop=Path(subprocess.check_output(['xdg-user-dir','DESKTOP'],text=True).strip())
 if desktop.is_dir() and desktop!=Path.home():
  shortcut=desktop/'QCY Desktop.desktop';shortcut.write_text(text);shortcut.chmod(0o755)
  subprocess.run(['gio','set',str(shortcut),'metadata::trusted','true'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
except (OSError,subprocess.CalledProcessError):pass
PY
if command -v update-desktop-database >/dev/null; then update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"; fi
echo 'Concluído. Abra QCY Desktop pelo menu de aplicativos.'
