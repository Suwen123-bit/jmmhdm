import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  LineChartOutlined,
  WalletOutlined,
  GiftOutlined,
  TeamOutlined,
  MessageOutlined,
  SettingOutlined,
  SafetyOutlined,
  AuditOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  NotificationOutlined,
  FileTextOutlined,
  IdcardOutlined,
  RobotOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useAuth } from '../store/auth';

const { Header, Sider, Content } = AntLayout;

const items = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理' },
  { key: '/trades', icon: <LineChartOutlined />, label: '交易订单' },
  { key: '/deposits', icon: <WalletOutlined />, label: '充值记录' },
  { key: '/withdrawals', icon: <WalletOutlined />, label: '提现审核' },
  { key: '/blindboxes', icon: <GiftOutlined />, label: '盲盒管理' },
  { key: '/products', icon: <AppstoreOutlined />, label: '盲盒商品' },
  { key: '/agents', icon: <TeamOutlined />, label: '代理管理' },
  { key: '/tickets', icon: <MessageOutlined />, label: '客服工单' },
  { key: '/kyc', icon: <IdcardOutlined />, label: 'KYC 审核' },
  { key: '/announcements', icon: <NotificationOutlined />, label: '公告管理' },
  { key: '/agreements', icon: <FileTextOutlined />, label: '协议管理' },
  { key: '/ai-monitor', icon: <RobotOutlined />, label: 'AI 风控' },
  { key: '/reports', icon: <BarChartOutlined />, label: '数据报表' },
  { key: '/configs', icon: <SettingOutlined />, label: '系统配置' },
  { key: '/risks', icon: <SafetyOutlined />, label: '风控配置' },
  { key: '/audit-logs', icon: <AuditOutlined />, label: '审计日志' },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={220} theme="dark">
        <div style={{ height: 56, color: '#f7b500', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {collapsed ? 'CP' : 'Crypto Admin'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={(e) => navigate(e.key)}
          items={items}
        />
      </Sider>
      <AntLayout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: '#1f1f1f' }}>
          <div style={{ color: '#fff', fontSize: 16 }}>管理后台</div>
          <Dropdown
            menu={{
              items: [
                { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { void logout().then(() => navigate('/login')); } },
              ],
            }}
          >
            <Button type="text" style={{ color: '#fff' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: 8 }} />
              {user?.username} ({user?.role})
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 16, background: '#141414', borderRadius: 8 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
