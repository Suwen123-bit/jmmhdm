import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Space, Modal, Form, Input, InputNumber, App, Switch } from 'antd';
import { request } from '../lib/api';

export default function Risks() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'risk-configs'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/risk-configs' }),
  });

  const setMutation = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/risk-configs/set', method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'risk-configs'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openEdit = (row?: any) => {
    setEditing(row ?? null);
    form.resetFields();
    if (row) {
      form.setFieldsValue({
        ...row,
        winBias: Number(row.winBias),
        forcedResult: row.forcedResult ?? '',
        priceBiasBps: Number(row.priceBiasBps ?? 0),
      });
    } else {
      form.setFieldsValue({ symbol: 'btcusdt', duration: 60, winBias: 0, priceBiasBps: 0, enabled: true });
    }
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={() => openEdit()}>新增风控规则</Button>
      </Space>
      <Table
        rowKey={(r) => `${r.symbol}:${r.duration}`}
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={[
          { title: '币种', dataIndex: 'symbol', width: 120, render: (v) => v?.toUpperCase() },
          { title: '时长(秒)', dataIndex: 'duration', width: 100 },
          { title: '胜率偏置', dataIndex: 'winBias', width: 120, render: (v) => `${(Number(v) * 100).toFixed(2)}%` },
          { title: '价格偏置(bps)', dataIndex: 'priceBiasBps', width: 130 },
          { title: '强制结果', dataIndex: 'forcedResult', width: 120, render: (v) => v || '-' },
          { title: '启用', dataIndex: 'enabled', width: 80, render: (v) => (v ? '✓' : '✗') },
          {
            title: '操作',
            key: 'op',
            width: 100,
            render: (_, row: any) => <Button size="small" onClick={() => openEdit(row)}>编辑</Button>,
          },
        ]}
      />

      <Modal title={editing ? '编辑风控规则' : '新增风控规则'} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(vals) => setMutation.mutate({ ...vals, forcedResult: vals.forcedResult || null })}>
          <Form.Item label="币种" name="symbol" rules={[{ required: true }]}>
            <Input placeholder="例如: btcusdt" disabled={!!editing} />
          </Form.Item>
          <Form.Item label="时长(秒)" name="duration" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} disabled={!!editing} />
          </Form.Item>
          <Form.Item label="胜率偏置 (-1 ~ 1，正向偏向用户胜)" name="winBias">
            <InputNumber style={{ width: '100%' }} min={-1} max={1} step={0.01} />
          </Form.Item>
          <Form.Item label="价格偏置 (bps，万分之 N)" name="priceBiasBps">
            <InputNumber style={{ width: '100%' }} step={1} />
          </Form.Item>
          <Form.Item label="强制结果 (留空 / win / lose)" name="forcedResult">
            <Input placeholder="留空表示不强制" />
          </Form.Item>
          <Form.Item label="启用" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={setMutation.isPending}>保存</Button>
        </Form>
      </Modal>
    </>
  );
}
