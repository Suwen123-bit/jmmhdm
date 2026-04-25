import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Button, Input, Space, Modal, Form, Select, InputNumber, App } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function Users() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', page, pageSize, search],
    queryFn: () => request<any>({ url: '/admin/users', params: { page, pageSize, search } }),
  });

  const adjustMutation = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/users/adjust-balance', method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('余额调整成功');
      setAdjustOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (vals: any) => request({ url: `/admin/users/${current.id}`, method: 'POST', data: { userId: current.id, ...vals } }),
    onSuccess: () => {
      message.success('已更新');
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="用户名 / 邮箱" allowClear onSearch={(v) => { setPage(1); setSearch(v); }} style={{ width: 280 }} />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1200 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户名', dataIndex: 'username', width: 140 },
          { title: '邮箱', dataIndex: 'email', width: 200 },
          { title: '余额', dataIndex: 'balance', width: 120, render: (v) => Number(v).toFixed(2) },
          { title: '冻结', dataIndex: 'frozenBalance', width: 100, render: (v) => Number(v).toFixed(2) },
          {
            title: '角色',
            dataIndex: 'role',
            width: 100,
            render: (v) => <Tag color={v === 'super_admin' ? 'red' : v === 'admin' ? 'orange' : v === 'agent' ? 'blue' : 'default'}>{v}</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            render: (v) => <Tag color={v === 'active' ? 'green' : v === 'frozen' ? 'orange' : 'red'}>{v}</Tag>,
          },
          { title: '邀请码', dataIndex: 'inviteCode', width: 100 },
          { title: '注册时间', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
          {
            title: '操作',
            key: 'op',
            fixed: 'right',
            width: 200,
            render: (_, row: any) => (
              <Space>
                <Button size="small" onClick={() => { setCurrent(row); setEditOpen(true); }}>编辑</Button>
                <Button size="small" type="primary" onClick={() => { setCurrent(row); setAdjustOpen(true); }}>调整余额</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={`调整余额 - ${current?.username}`}
        open={adjustOpen}
        onCancel={() => setAdjustOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form layout="vertical" onFinish={(vals) => adjustMutation.mutate({ userId: current.id, ...vals })}>
          <Form.Item label="金额 (正数为增加，负数为扣减)" name="amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} step={0.01} />
          </Form.Item>
          <Form.Item label="原因" name="reason" rules={[{ required: true, min: 2 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={adjustMutation.isPending}>提交</Button>
        </Form>
      </Modal>

      <Modal
        title={`编辑用户 - ${current?.username}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          initialValues={{ status: current?.status, role: current?.role, email: current?.email }}
          onFinish={(vals) => editMutation.mutate(vals)}
        >
          <Form.Item label="邮箱" name="email"><Input /></Form.Item>
          <Form.Item label="状态" name="status">
            <Select options={[{ value: 'active', label: '正常' }, { value: 'frozen', label: '冻结' }, { value: 'banned', label: '封禁' }]} />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select options={[{ value: 'user', label: '普通用户' }, { value: 'agent', label: '代理' }, { value: 'admin', label: '管理员' }]} />
          </Form.Item>
          <Form.Item label="重置密码 (留空不修改)" name="password"><Input.Password /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={editMutation.isPending}>保存</Button>
        </Form>
      </Modal>
    </>
  );
}
