/**
 * 邮件模板 i18n
 *
 * 用法：
 *   const t = renderEmail('register_welcome', 'zh-CN', { username: 'alice' });
 *   await sendEmail({ userId, subject: t.subject, html: t.html });
 *
 * 用户语言来源：users.language 字段（默认 zh-CN）
 */

export type EmailTemplateKey =
  | 'register_welcome'
  | 'login_new_device'
  | 'deposit_received'
  | 'withdraw_approved'
  | 'withdraw_rejected'
  | 'security_alert'
  | 'commission_received';

export type EmailLang = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko';

interface Template {
  subject: string;
  html: (vars: Record<string, any>) => string;
}

const baseStyle = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f4f4f5; padding:24px; }
  .card { max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,.06); }
  h1 { color:#0b0d12; font-size:20px; margin:0 0 16px; }
  p { color:#3f3f46; line-height:1.6; }
  .btn { display:inline-block; background:#f59e0b; color:#fff !important; padding:10px 20px; border-radius:8px; text-decoration:none; }
  .footer { color:#a1a1aa; font-size:12px; margin-top:24px; }
`;
function wrap(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head><body><div class="card"><h1>${title}</h1>${body}<div class="footer">本邮件由系统自动发送，请勿回复。</div></div></body></html>`;
}

const TEMPLATES: Record<EmailLang, Record<EmailTemplateKey, Template>> = {
  'zh-CN': {
    register_welcome: {
      subject: '欢迎加入 Crypto Platform',
      html: (v) => wrap('欢迎，' + v.username, '<p>您的账户已创建成功。建议立即设置 <strong>资金密码</strong> 与 <strong>二步验证</strong>，保障账户安全。</p>'),
    },
    login_new_device: {
      subject: '检测到新设备登录',
      html: (v) => wrap('新设备登录', `<p>时间：${v.time}<br/>IP：${v.ip}<br/>设备：${v.device ?? '未知'}</p><p>若非本人操作，请立即修改密码。</p>`),
    },
    deposit_received: {
      subject: '充值到账',
      html: (v) => wrap('充值到账', `<p>您的充值 <strong>${v.amount} USDT</strong> 已到账。</p>`),
    },
    withdraw_approved: {
      subject: '提现已审批通过',
      html: (v) => wrap('提现已审批', `<p>金额：<strong>${v.amount} ${v.currency}</strong><br/>地址：${v.address}<br/>预计 30 分钟内到账。</p>`),
    },
    withdraw_rejected: {
      subject: '提现申请被拒绝',
      html: (v) => wrap('提现被拒', `<p>原因：${v.reason}</p><p>资金已退回您的账户。</p>`),
    },
    security_alert: {
      subject: '【重要】安全告警',
      html: (v) => wrap('安全告警', `<p>${v.content}</p>`),
    },
    commission_received: {
      subject: '佣金到账',
      html: (v) => wrap('佣金到账', `<p>L${v.level} 佣金 <strong>${v.amount} USDT</strong> 已发放，来自下级用户 #${v.fromUserId}。</p>`),
    },
  },
  'zh-TW': {
    register_welcome: {
      subject: '歡迎加入 Crypto Platform',
      html: (v) => wrap('歡迎，' + v.username, '<p>您的帳戶已建立成功。建議立即設定 <strong>資金密碼</strong> 與 <strong>二步驗證</strong>。</p>'),
    },
    login_new_device: {
      subject: '偵測到新裝置登入',
      html: (v) => wrap('新裝置登入', `<p>時間：${v.time}<br/>IP：${v.ip}</p><p>若非本人操作，請立即修改密碼。</p>`),
    },
    deposit_received: {
      subject: '充值到帳',
      html: (v) => wrap('充值到帳', `<p>您的充值 <strong>${v.amount} USDT</strong> 已到帳。</p>`),
    },
    withdraw_approved: {
      subject: '提現已審批',
      html: (v) => wrap('提現已審批', `<p>金額：<strong>${v.amount} ${v.currency}</strong></p>`),
    },
    withdraw_rejected: {
      subject: '提現被拒絕',
      html: (v) => wrap('提現被拒', `<p>原因：${v.reason}</p>`),
    },
    security_alert: {
      subject: '【重要】安全告警',
      html: (v) => wrap('安全告警', `<p>${v.content}</p>`),
    },
    commission_received: {
      subject: '佣金到帳',
      html: (v) => wrap('佣金到帳', `<p>L${v.level} 佣金 <strong>${v.amount} USDT</strong></p>`),
    },
  },
  en: {
    register_welcome: {
      subject: 'Welcome to Crypto Platform',
      html: (v) => wrap('Welcome, ' + v.username, '<p>Your account has been created. We recommend enabling <strong>Funding Password</strong> and <strong>2FA</strong> immediately.</p>'),
    },
    login_new_device: {
      subject: 'New device login detected',
      html: (v) => wrap('New Device Login', `<p>Time: ${v.time}<br/>IP: ${v.ip}<br/>Device: ${v.device ?? 'Unknown'}</p><p>If this wasn't you, change your password now.</p>`),
    },
    deposit_received: {
      subject: 'Deposit received',
      html: (v) => wrap('Deposit Received', `<p>Your deposit of <strong>${v.amount} USDT</strong> has been credited.</p>`),
    },
    withdraw_approved: {
      subject: 'Withdrawal approved',
      html: (v) => wrap('Withdrawal Approved', `<p>Amount: <strong>${v.amount} ${v.currency}</strong><br/>Address: ${v.address}</p>`),
    },
    withdraw_rejected: {
      subject: 'Withdrawal rejected',
      html: (v) => wrap('Withdrawal Rejected', `<p>Reason: ${v.reason}</p>`),
    },
    security_alert: {
      subject: '[Important] Security alert',
      html: (v) => wrap('Security Alert', `<p>${v.content}</p>`),
    },
    commission_received: {
      subject: 'Commission received',
      html: (v) => wrap('Commission', `<p>L${v.level} commission <strong>${v.amount} USDT</strong> credited.</p>`),
    },
  },
  ja: {
    register_welcome: {
      subject: 'Crypto Platform へようこそ',
      html: (v) => wrap('ようこそ、' + v.username, '<p>アカウントが作成されました。<strong>資金パスワード</strong> と <strong>二段階認証</strong> を有効にすることを推奨します。</p>'),
    },
    login_new_device: {
      subject: '新しいデバイスからのログイン',
      html: (v) => wrap('新規ログイン', `<p>時刻: ${v.time}<br/>IP: ${v.ip}</p>`),
    },
    deposit_received: {
      subject: '入金が反映されました',
      html: (v) => wrap('入金完了', `<p>入金 <strong>${v.amount} USDT</strong> が反映されました。</p>`),
    },
    withdraw_approved: {
      subject: '出金が承認されました',
      html: (v) => wrap('出金承認', `<p>金額: <strong>${v.amount} ${v.currency}</strong></p>`),
    },
    withdraw_rejected: {
      subject: '出金が拒否されました',
      html: (v) => wrap('出金拒否', `<p>理由: ${v.reason}</p>`),
    },
    security_alert: {
      subject: '【重要】セキュリティ警告',
      html: (v) => wrap('セキュリティ警告', `<p>${v.content}</p>`),
    },
    commission_received: {
      subject: '報酬を受け取りました',
      html: (v) => wrap('報酬', `<p>L${v.level} 報酬 <strong>${v.amount} USDT</strong></p>`),
    },
  },
  ko: {
    register_welcome: {
      subject: 'Crypto Platform 가입을 환영합니다',
      html: (v) => wrap('환영합니다, ' + v.username, '<p>계정이 생성되었습니다. <strong>자금 비밀번호</strong>와 <strong>2단계 인증</strong>을 즉시 설정하시기 바랍니다.</p>'),
    },
    login_new_device: {
      subject: '새 기기 로그인 감지',
      html: (v) => wrap('새 기기 로그인', `<p>시간: ${v.time}<br/>IP: ${v.ip}</p>`),
    },
    deposit_received: {
      subject: '입금이 완료되었습니다',
      html: (v) => wrap('입금 완료', `<p><strong>${v.amount} USDT</strong> 입금이 완료되었습니다.</p>`),
    },
    withdraw_approved: {
      subject: '출금이 승인되었습니다',
      html: (v) => wrap('출금 승인', `<p>금액: <strong>${v.amount} ${v.currency}</strong></p>`),
    },
    withdraw_rejected: {
      subject: '출금이 거부되었습니다',
      html: (v) => wrap('출금 거부', `<p>사유: ${v.reason}</p>`),
    },
    security_alert: {
      subject: '[중요] 보안 경고',
      html: (v) => wrap('보안 경고', `<p>${v.content}</p>`),
    },
    commission_received: {
      subject: '커미션이 입금되었습니다',
      html: (v) => wrap('커미션', `<p>L${v.level} 커미션 <strong>${v.amount} USDT</strong></p>`),
    },
  },
};

export function renderEmail(
  key: EmailTemplateKey,
  lang: string | null | undefined,
  vars: Record<string, any>
): { subject: string; html: string } {
  const lng = (TEMPLATES[lang as EmailLang] ? lang : 'zh-CN') as EmailLang;
  const tpl = TEMPLATES[lng][key];
  return { subject: tpl.subject, html: tpl.html(vars) };
}
