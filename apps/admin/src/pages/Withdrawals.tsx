import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Select, Space, Button, Modal, Form, Input, App } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

export default function Withdrawals() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>('pending');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'withdrawals', page, pageSize, status],
    queryFn: () => request<any>({ url: '/admin/withdrawals', params: { page, pageSize, status } }),
  });

  const approve = useMutation({
    mutationFn: (id: number) => request({ url: `/admin/withdrawals/${id}/approve`, method: 'POST', data: {} }),
    onSuccess: () => {
      message.success('已批准');
      qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (vals: { note: string }) => request({ url: `/admin/withdrawals/${current.id}/reject`, method: 'POST', data: vals }),
    onSuccess: () => {
      message.success('已拒绝');
      setRejectOpen(false);
      qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="状态"
          value={status}
          style={{ width: 160 }}
          options={[
            { value: 'pending', label: '待审核' },
            { value: 'approved', label: '已批准' },
            { value: 'finished', label: '已完成' },
            { value: 'rejected', label: '已拒绝' },
            { value: 'failed', label: '失败' },
          ]}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        scroll={{ x: 1300 }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户', dataIndex: 'username', width: 130 },
          { title: '币种', dataIndex: 'currency', width: 80, render: (v) => v?.toUpperCase() },
          { title: '网络', dataIndex: 'network', width: 90 },
          { title: '金额', dataIndex: 'amount', width: 110, render: (v) => Number(v).toFixed(2) },
          { title: '手续费', dataIndex: 'fee', width: 90, render: (v) => Number(v).toFixed(2) },
          { title: '到账地址', dataIndex: 'toAddress', width: 220, ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v) => <Tag color={v === 'pending' ? 'orange' : v === 'approved' || v === 'finished' ? 'green' : 'red'}>{v}</Tag>,
          },
          { title: '申请时间', dataIndex: 'createdAt', width: 160, render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
          {
            title: '操作',
            key: 'op',
            fixed: 'right',
            width: 200,
            render: (_, row: any) => row.status === 'pending' ? (
              <Space>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => modal.confirm({
                    title: '批准提现',
                    content: `确认批准 ${row.amount} ${row.currency.toUpperCase()} 至 ${row.toAddress}?`,
                    onOk: () => approve.mutateAsync(row.id),
                  })}
                >批准</Button>
                <Button size="small" danger onClick={() => { setCurrent(row); setRejectOpen(true); }}>拒绝</Button>
              </Space>
            ) : null,
          },
        ]}
      />

      <Modal title={`拒绝提现 - #${current?.id}`} open={rejectOpen} onCancel={() => setRejectOpen(false)} footer={null} destroyOnClose>
        <Form layout="vertical" onFinish={(vals) => reject.mutate(vals)}>
          <Form.Item label="拒绝理由" name="note" rules={[{ required: true, min: 2, max: 500 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" danger htmlType="submit" block loading={reject.isPending}>确认拒绝</Button>
        </Form>
      </Modal>
    </>
  );
}
