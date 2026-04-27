$ErrorActionPreference = 'Continue'
$base = 'http://127.0.0.1:3001/api'
$results = New-Object System.Collections.ArrayList

function Hit($name, $method, $path, $headers, $body) {
  $url = "$base$path"
  try {
    $params = @{ Method = $method; Uri = $url }
    if ($headers) { $params.Headers = $headers }
    if ($body) {
      $params.Body = ($body | ConvertTo-Json -Depth 8)
      $params.ContentType = 'application/json'
    }
    $r = Invoke-RestMethod @params
    [void]$results.Add([pscustomobject]@{ name=$name; status='OK'; data=$r })
    return $r
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    [void]$results.Add([pscustomobject]@{ name=$name; status='FAIL'; data=$msg })
    return $null
  }
}

# 1. Admin login
$adminLogin = Hit 'admin.login' 'POST' '/auth/login' $null @{ account='admin'; password='Admin@123456' }
$adminToken = $adminLogin.data.accessToken
$adminH = @{ Authorization = "Bearer $adminToken" }

# 2. Reset suwen123 password via admin (idempotent), then login
$findUser = Hit 'admin.find.suwen123' 'GET' '/admin/users?search=suwen123&page=1&pageSize=1' $adminH $null
$suwenId = $null
if ($findUser.data.items.Count -gt 0) { $suwenId = $findUser.data.items[0].id }
if (-not $suwenId) {
  $reg = Hit 'user.register' 'POST' '/auth/register' $null @{ username='suwen123'; email='suwen123@test.com'; password='Suwen@123456' }
  if ($reg.data.user.id) { $suwenId = $reg.data.user.id }
}
if ($suwenId) {
  Hit 'admin.reset.suwen123.pwd' 'POST' "/admin/users/$suwenId" $adminH @{ password='Suwen@123456' }
}
$userLogin = Hit 'user.login' 'POST' '/auth/login' $null @{ account='suwen123'; password='Suwen@123456' }
$userToken = $userLogin.data.accessToken
$userH = @{ Authorization = "Bearer $userToken" }

# 3. Public/auth user routes
Hit 'user.me' 'GET' '/user/me' $userH $null
Hit 'config.public' 'GET' '/config/public' $null $null
Hit 'agreement.current' 'GET' '/agreement/current' $null $null

# 4. Market data
Hit 'trade.tickers' 'GET' '/trade/tickers' $null $null
Hit 'trade.ticker.btc' 'GET' '/trade/ticker/btcusdt' $null $null
Hit 'trade.kline' 'GET' '/trade/kline?symbol=btcusdt&interval=1min&limit=10' $null $null
Hit 'trade.klines.path' 'GET' '/trade/klines/btcusdt?interval=1min&limit=10' $null $null
Hit 'trade.risk' 'GET' '/trade/risk?symbol=btcusdt&duration=60' $null $null
Hit 'trade.risk-configs' 'GET' '/trade/risk-configs' $null $null

# 5. User trade routes
Hit 'trade.list' 'GET' '/trade/list?status=all&page=1&pageSize=10' $userH $null
Hit 'trade.history' 'GET' '/trade/history?status=all&page=1&pageSize=10' $userH $null
Hit 'trade.positions' 'GET' '/trade/positions' $userH $null

# 6. Wallet
Hit 'wallet.balance' 'GET' '/wallet/balance' $userH $null
Hit 'wallet.deposits' 'GET' '/wallet/deposits' $userH $null
Hit 'wallet.withdrawals' 'GET' '/wallet/withdrawals' $userH $null
Hit 'wallet.dev-deposit' 'POST' '/wallet/dev-deposit' $userH @{ amount=200 }

# 7. Blindbox
Hit 'blindbox.list' 'GET' '/blindbox/list' $null $null
Hit 'blindbox.inventory' 'GET' '/blindbox/inventory' $userH $null

# 8. Ticket / Profile / KYC / Agreement
Hit 'user.wallet.logs' 'GET' '/user/wallet/logs?page=1&pageSize=10' $userH $null
Hit 'user.login.logs' 'GET' '/user/login-logs?page=1&pageSize=10' $userH $null
Hit 'user.notifications' 'GET' '/user/notifications?page=1&pageSize=10' $userH $null
Hit 'ticket.list' 'GET' '/ticket/list?page=1&pageSize=10' $userH $null
Hit 'kyc.status' 'GET' '/kyc/status' $userH $null
Hit 'agreement.list' 'GET' '/agreement/list' $userH $null

# 9. Admin endpoints
Hit 'admin.dashboard' 'GET' '/admin/dashboard' $adminH $null
Hit 'admin.users' 'GET' '/admin/users?page=1&pageSize=10' $adminH $null
Hit 'admin.trades' 'GET' '/admin/trades?page=1&pageSize=10' $adminH $null
Hit 'admin.deposits' 'GET' '/admin/deposits?page=1&pageSize=10' $adminH $null
Hit 'admin.withdrawals' 'GET' '/admin/withdrawals?page=1&pageSize=10' $adminH $null
Hit 'admin.risk-configs' 'GET' '/admin/risk-configs' $adminH $null
Hit 'admin.blindboxes' 'GET' '/admin/blindboxes' $adminH $null
Hit 'admin.tickets' 'GET' '/admin/tickets?page=1&pageSize=10' $adminH $null
Hit 'admin.kyc' 'GET' '/admin/kyc?page=1&pageSize=10' $adminH $null
Hit 'admin.agents' 'GET' '/admin/agents?page=1&pageSize=10' $adminH $null
Hit 'admin.configs' 'GET' '/admin/configs' $adminH $null
Hit 'admin.agreements' 'GET' '/admin/agreements' $adminH $null
Hit 'admin.ai-monitor' 'GET' '/admin/ai-monitor/summary' $adminH $null
Hit 'admin.blindbox-products' 'GET' '/admin/blindbox-products' $adminH $null
Hit 'admin.announcements' 'GET' '/admin/announcements' $adminH $null
Hit 'admin.ip-blacklist' 'GET' '/admin/ip-blacklist' $adminH $null
Hit 'admin.geo-blocks' 'GET' '/admin/geo-blocks' $adminH $null
Hit 'admin.audit-logs' 'GET' '/admin/audit-logs?page=1&pageSize=10' $adminH $null

# 10. Place a small trade
Hit 'trade.open' 'POST' '/trade/open' $userH @{ symbol='btcusdt'; direction='call'; amount=10; duration=60 }

# Output
$results | ForEach-Object {
  $tag = if ($_.status -eq 'OK') { '[OK]  ' } else { '[FAIL]' }
  $snippet = ($_.data | Out-String).Trim()
  if ($snippet.Length -gt 200) { $snippet = $snippet.Substring(0,200) + '...' }
  "$tag $($_.name)  ::  $snippet"
}

$fail = ($results | Where-Object { $_.status -eq 'FAIL' }).Count
$ok = ($results | Where-Object { $_.status -eq 'OK' }).Count
"`n=== TOTAL: OK=$ok FAIL=$fail ==="
