import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Button, Space, Modal, Form, InputNumber, App } from 'antd';
import { request } from '../lib/api';

export default function Agents() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'agents'],
    queryFn: () => request<{ items: any[] }>({ url: '/admin/agents' }),
  });

  const setRate = useMutation({
    mutationFn: (vals: any) => request({ url: '/admin/agents/rate', method: 'POST', data: { userId: current.id, ...vals } }),
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'agents'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户名', dataIndex: 'username', width: 160 },
          { title: '邮箱', dataIndex: 'email', width: 220 },
          { title: '邀请码', dataIndex: 'inviteCode', width: 110 },
          { title: 'L1 返佣', dataIndex: 'l1Rate', width: 110, render: (v) => `${(Number(v) * 100).toFixed(2)}%` },
          { title: 'L2 返佣', dataIndex: 'l2Rate', width: 110, render: (v) => `${(Number(v) * 100).toFixed(2)}%` },
          { title: 'L3 返佣', dataIndex: 'l3Rate', width: 110, render: (v) => `${(Number(v) * 100).toFixed(2)}%` },
          {
            title: '操作',
            key: 'op',
            width: 120,
            render: (_, row: any) => (
              <Button size="small" onClick={() => {
                setCurrent(row);
                form.setFieldsValue({
                  l1Rate: Number(row.l1Rate),
                  l2Rate: Number(row.l2Rate),
                  l3Rate: Number(row.l3Rate),
                });
                setOpen(true);
              }}>调整费率</Button>
            ),
          },
        ]}
      />

      <Modal title={`调整返佣 - ${current?.username}`} open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(vals) => setRate.mutate(vals)}>
          <Form.Item label="L1 返佣率 (0~1)" name="l1Rate" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
          </Form.Item>
          <Form.Item label="L2 返佣率 (0~1)" name="l2Rate" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
          </Form.Item>
          <Form.Item label="L3 返佣率 (0~1)" name="l3Rate" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={setRate.isPending}>保存</Button>
        </Form>
      </Modal>
    </>
  );
}
