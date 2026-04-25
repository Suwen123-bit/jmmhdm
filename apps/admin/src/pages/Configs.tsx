import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Space, Modal, Form, Input, App } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function Configs() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'configs'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/configs' }),
  });

  const setMutation = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/configs/set', method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'configs'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const initDefaults = useMutation({
    mutationFn: () => request({ url: '/admin/configs/init-defaults', method: 'POST' }),
    onSuccess: () => {
      message.success('默认配置已初始化');
      qc.invalidateQueries({ queryKey: ['admin', 'configs'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const openEdit = (row: any) => {
    setCurrent(row);
    form.resetFields();
    form.setFieldsValue({
      key: row.key,
      value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value, null, 2),
    });
    setOpen(true);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => initDefaults.mutate()} loading={initDefaults.isPending}>初始化默认配置</Button>
        <Button type="primary" onClick={() => { setCurrent(null); form.resetFields(); setOpen(true); }}>新增配置</Button>
      </Space>
      <Table
        rowKey="key"
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={[
          { title: 'Key', dataIndex: 'key', width: 280 },
          {
            title: 'Value',
            dataIndex: 'value',
            render: (v) => (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxWidth: 600 }}>
                {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
              </pre>
            ),
          },
          { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: (v) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
          {
            title: '操作',
            key: 'op',
            width: 100,
            render: (_, row: any) => <Button size="small" onClick={() => openEdit(row)}>编辑</Button>,
          },
        ]}
      />

      <Modal title={current ? `编辑配置 - ${current.key}` : '新增配置'} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose width={720}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(vals) => {
            let parsed: any = vals.value;
            try {
              parsed = JSON.parse(vals.value);
            } catch {}
            setMutation.mutate({ key: vals.key, value: parsed });
          }}
        >
          <Form.Item label="Key" name="key" rules={[{ required: true }]}>
            <Input disabled={!!current} placeholder="例如: trade.maxAmountPerOrder" />
          </Form.Item>
          <Form.Item label="Value (支持 JSON)" name="value" rules={[{ required: true }]}>
            <Input.TextArea rows={10} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={setMutation.isPending}>保存</Button>
        </Form>
      </Modal>
    </>
  );
}
