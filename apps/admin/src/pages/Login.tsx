import { useState } from 'react';
import { Form, Input, Button, Card, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function Login() {
  const { message } = App.useApp();
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (vals: { account: string; password: string; totpCode?: string }) => {
    setLoading(true);
    try {
      await login(vals.account, vals.password, vals.totpCode || undefined);
      message.success('登录成功');
      navigate('/');
    } catch (e: any) {
      message.error(e?.message ?? '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card title="管理后台登录" style={{ width: 400 }}>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item label="账号" name="account" rules={[{ required: true, message: '请输入账号' }]}>
            <Input size="large" placeholder="管理员账号" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Form.Item label="2FA 验证码 (如已启用)" name="totpCode">
            <Input size="large" placeholder="6 位数字" maxLength={6} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
