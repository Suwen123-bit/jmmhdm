import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, App } from 'antd';
import { request } from '../lib/api';

const RARITY_OPTIONS = [
  { value: 'common', label: '普通' },
  { value: 'rare', label: '稀有' },
  { value: 'epic', label: '史诗' },
  { value: 'legendary', label: '传说' },
];

const RARITY_COLORS: Record<string, string> = {
  common: 'default',
  rare: 'blue',
  epic: 'purple',
  legendary: 'gold',
};

export default function Products() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'blindbox-products'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/blindbox-products' }),
  });

  const upsert = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/blindbox-products/upsert', method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'blindbox-products'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openEdit = (row?: any) => {
    setEditing(row ?? null);
    form.resetFields();
    if (row) form.setFieldsValue(row);
    else form.setFieldsValue({ rarity: 'common', enabled: true });
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => openEdit()}>新建商品</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '名称', dataIndex: 'name', width: 200 },
          { title: '稀有度', dataIndex: 'rarity', width: 100, render: (v) => <Tag color={RARITY_COLORS[v] ?? 'default'}>{v}</Tag> },
          { title: '价值 (USDT)', dataIndex: 'value', width: 130, render: (v) => Number(v).toFixed(2) },
          { title: '图片', dataIndex: 'imageUrl', width: 120, render: (v) => v ? <img src={v} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : '-' },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          { title: '状态', dataIndex: 'enabled', width: 90, render: (v) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
          {
            title: '操作',
            key: 'op',
            width: 100,
            render: (_, row: any) => <Button size="small" onClick={() => openEdit(row)}>编辑</Button>,
          },
        ]}
      />

      <Modal title={editing ? '编辑商品' : '新建商品'} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(vals) => upsert.mutate(editing ? { id: editing.id, ...vals } : vals)}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="稀有度" name="rarity" rules={[{ required: true }]}>
            <Select options={RARITY_OPTIONS} />
          </Form.Item>
          <Form.Item label="价值 (USDT)" name="value" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
          </Form.Item>
          <Form.Item label="图片 URL" name="imageUrl"><Input /></Form.Item>
          <Form.Item label="描述" name="description"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item label="状态" name="enabled" initialValue={true}>
            <Select options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={upsert.isPending}>保存</Button>
        </Form>
      </Modal>
    </>
  );
}
