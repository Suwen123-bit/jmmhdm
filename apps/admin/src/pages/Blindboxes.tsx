import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Button, Space, Modal, Form, Input, InputNumber, Select, App, Drawer, Card } from 'antd';
import { request } from '../lib/api';

export default function Blindboxes() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [itemDrawer, setItemDrawer] = useState<{ id: number; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'blindboxes'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/blindboxes' }),
  });

  const upsert = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/blindboxes/upsert', method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'blindboxes'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openEdit = (row?: any) => {
    setEditing(row ?? null);
    form.resetFields();
    if (row) form.setFieldsValue(row);
    else form.setFieldsValue({ enabled: true, currency: 'usdt' });
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => openEdit()}>新建盲盒</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '名称', dataIndex: 'name', width: 200 },
          { title: '价格', dataIndex: 'price', width: 110, render: (v) => Number(v).toFixed(2) },
          { title: '币种', dataIndex: 'currency', width: 80, render: (v) => v?.toUpperCase() },
          { title: '冷却(秒)', dataIndex: 'cooldownSec', width: 90 },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          { title: '状态', dataIndex: 'enabled', width: 90, render: (v) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
          {
            title: '操作',
            key: 'op',
            width: 200,
            render: (_, row: any) => (
              <Space>
                <Button size="small" onClick={() => openEdit(row)}>编辑</Button>
                <Button size="small" onClick={() => setItemDrawer({ id: row.id, name: row.name })}>商品配置</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal title={editing ? '编辑盲盒' : '新建盲盒'} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(vals) => upsert.mutate(editing ? { id: editing.id, ...vals } : vals)}>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="描述" name="description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="封面 URL" name="coverUrl"><Input /></Form.Item>
          <Form.Item label="价格" name="price" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
          </Form.Item>
          <Form.Item label="币种" name="currency" initialValue="usdt"><Input /></Form.Item>
          <Form.Item label="冷却(秒)" name="cooldownSec" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="状态" name="enabled" initialValue={true}>
            <Select options={[{ value: true, label: '启用' }, { value: false, label: '停用' }]} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={upsert.isPending}>保存</Button>
        </Form>
      </Modal>

      <Drawer
        title={itemDrawer ? `配置商品 - ${itemDrawer.name}` : ''}
        open={!!itemDrawer}
        onClose={() => setItemDrawer(null)}
        width={720}
        destroyOnClose
      >
        {itemDrawer && <ItemConfig boxId={itemDrawer.id} onSaved={() => setItemDrawer(null)} />}
      </Drawer>
    </>
  );
}

function ItemConfig({ boxId, onSaved }: { boxId: number; onSaved: () => void }) {
  const { message } = App.useApp();
  const { data: products } = useQuery({
    queryKey: ['admin', 'blindbox-products'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/blindbox-products' }),
  });
  const [items, setItems] = useState<{ productId: number; weight: number }[]>([]);

  const save = useMutation({
    mutationFn: () => request({ url: `/admin/blindboxes/${boxId}/items`, method: 'POST', data: items }),
    onSuccess: () => {
      message.success('已保存');
      onSaved();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const totalWeight = items.reduce((s, it) => s + Number(it.weight), 0);

  return (
    <div>
      <p style={{ color: '#999' }}>添加商品并设置权重，掉率 = 权重 / 总权重。</p>
      <Card size="small" title={`已选 ${items.length} 件 · 总权重 ${totalWeight}`}>
        {items.map((it, idx) => {
          const product = products?.items.find((p) => p.id === it.productId);
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{product?.name ?? `#${it.productId}`} ({product?.rarity})</span>
              <InputNumber
                min={0}
                value={it.weight}
                onChange={(v) => {
                  const next = [...items];
                  next[idx].weight = Number(v ?? 0);
                  setItems(next);
                }}
                style={{ width: 120 }}
              />
              <span style={{ width: 60, textAlign: 'right' }}>
                {totalWeight > 0 ? `${((it.weight / totalWeight) * 100).toFixed(1)}%` : '-'}
              </span>
              <Button size="small" danger onClick={() => setItems(items.filter((_, i) => i !== idx))}>删除</Button>
            </div>
          );
        })}
      </Card>
      <Card size="small" title="可选商品" style={{ marginTop: 16 }}>
        {(products?.items ?? []).map((p) => (
          <Button
            key={p.id}
            size="small"
            style={{ margin: 4 }}
            disabled={items.some((it) => it.productId === p.id)}
            onClick={() => setItems([...items, { productId: p.id, weight: 1 }])}
          >
            + {p.name} ({p.rarity})
          </Button>
        ))}
      </Card>
      <Button type="primary" block style={{ marginTop: 16 }} onClick={() => save.mutate()} loading={save.isPending} disabled={!items.length}>
        保存配置
      </Button>
    </div>
  );
}
