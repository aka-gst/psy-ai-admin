#!/bin/sh
# Одна команда, поднимающая показ целиком. Безопасно запускать повторно:
# то, что уже работает, не трогается.
#
#   sh scripts/demo-start.sh
#
# После перезагрузки Мака ничего не поднимается само — автозапуск не ставим,
# это изменение в системе. Просто выполните эту команду ещё раз.

set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
LOGS="$ROOT/trash/demo-logs"
mkdir -p "$LOGS"

alive() { curl -s -o /dev/null --max-time 2 "$1"; }

# --- v2: сервер с моделью. Без него кризис распознаётся только по словарю. ---
if alive http://127.0.0.1:4180/api/config; then
  echo "v2 уже работает на 4180"
else
  echo "поднимаю v2 на 4180…"
  ( cd "$ROOT/v2" && LLM_BASE_URL="${LLM_BASE_URL:-http://127.0.0.1:11434}" \
      CHAT_MODEL="${LLM_MODEL:-qwen3:8b}" ALLOWED_ORIGINS="http://127.0.0.1:4700,http://localhost:4700" ASSISTANT_CATALOG="hosted-demo/app/center-content.json" ASSISTANT_DOCUMENTS="data/private/documents.json" nohup node server.mjs > "$LOGS/v2.log" 2>&1 < /dev/null & )
fi

# --- показ виджета поверх сохранённых страниц центра ---
if alive http://127.0.0.1:4700/services; then
  echo "показ уже работает на 4700"
else
  echo "поднимаю показ на 4700…"
  ( cd "$ROOT" && nohup node scripts/demo-widget.mjs --port 4700 \
      --endpoint http://127.0.0.1:4180/api/ask > "$LOGS/widget.log" 2>&1 < /dev/null & )
fi

# Ждём, пока оба действительно ответят: «запустил» и «отвечает» — разные вещи.
i=0
while [ $i -lt 25 ]; do
  if alive http://127.0.0.1:4180/api/config && alive http://127.0.0.1:4700/services; then break; fi
  i=$((i+1)); sleep 1
done

echo
if alive http://127.0.0.1:4700/services; then
  echo "ГОТОВО. Открывайте:  http://127.0.0.1:4700/services"
  echo "Другие страницы центра: /  /schedule  /psycluborion  /pweducation  /consultation  /programs"
else
  echo "НЕ ПОДНЯЛОСЬ. Загляните в $LOGS/widget.log"
  exit 1
fi

if alive http://127.0.0.1:4180/api/config; then
  echo "Модель подключена: распознавание кризиса работает полностью."
else
  echo "ВНИМАНИЕ: v2 на 4180 не отвечает. Помощник будет работать, но кризис"
  echo "распознаётся только по словарю слов — кризисный сценарий лучше не показывать."
  echo "Загляните в $LOGS/v2.log"
fi

echo
echo "Публичная ссылка (чтобы открыли с чужого компьютера):"
echo "  cloudflared tunnel --url http://127.0.0.1:4700"
echo "  адрес появится в выводе команды и живёт, пока она запущена"
echo
echo "Если приглашение терминала не вернулось — нажмите Ctrl-C."
echo "Серверы это не остановит: они запущены отдельно от терминала."
