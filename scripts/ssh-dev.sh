#!/bin/bash
# SSH vào server dev bằng mật khẩu (dùng expect).
# Thông tin đăng nhập đọc từ .dev-server.env (gitignored).
#   scripts/ssh-dev.sh                 -> mở shell tương tác
#   scripts/ssh-dev.sh "docker ps"     -> chạy lệnh rồi thoát
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/.dev-server.env"
export DEV_SSH_HOST DEV_SSH_USER DEV_SSH_PASSWORD
export DEV_SSH_CMD="$*"

exec expect -c '
set timeout -1
set target "$env(DEV_SSH_USER)@$env(DEV_SSH_HOST)"
set opts {-o StrictHostKeyChecking=accept-new -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive}
if {$env(DEV_SSH_CMD) eq ""} {
  spawn ssh {*}$opts $target
} else {
  spawn ssh {*}$opts $target $env(DEV_SSH_CMD)
}
expect {
  -re "(?i)password:" { send -- "$env(DEV_SSH_PASSWORD)\r" }
  eof { catch wait r; exit [lindex $r 3] }
}
if {$env(DEV_SSH_CMD) eq ""} { interact } else { expect eof }
catch wait r; exit [lindex $r 3]
'
