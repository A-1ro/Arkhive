#!/usr/bin/env python3
"""Register Discord OAuth secrets without writing them to a file or shell history."""
import getpass
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CALLBACK = "https://arkhive.aaa-4e2k3.workers.dev/auth/discord/callback"

def main():
    os.chdir(ROOT)
    if not sys.stdin.isatty():
        sys.exit("対話式ターミナルで実行してください。")
    print("Discord Developer Portal → OAuth2 → Redirects に次を登録してください。")
    print(CALLBACK)
    client_id = input("Client ID: ").strip()
    if not re.fullmatch(r"\d{17,22}", client_id):
        sys.exit("Client IDはDiscordのApplication ID（数字）を指定してください。")
    secret = getpass.getpass("Client Secret（画面には表示されません）: ").strip()
    if len(secret) < 16:
        sys.exit("Client Secretが短すぎます。OAuth2のClient Secretを確認してください。")
    payload = json.dumps({"DISCORD_CLIENT_ID": client_id, "DISCORD_CLIENT_SECRET": secret,
                          "DISCORD_REDIRECT_URI": CALLBACK})
    subprocess.run(["npx", "wrangler", "secret", "bulk"], input=payload, text=True, check=True)
    print("設定しました。公開サイトを再読み込みしてDiscordログインを確認してください。")

if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        sys.exit("\n中断しました。")
