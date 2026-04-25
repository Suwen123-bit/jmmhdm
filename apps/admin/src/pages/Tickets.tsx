import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, Tag, Button, Space, Drawer, Input, App, Select } from 'antd';
import dayjs from 'dayjs';
import { request } from '../lib/api';

const STATUS_OPTIONS = [
  { value: 'open', label: '处理中' },
  { value: 'pending', label: '等待回复' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
];

export default function Tickets() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string | undefined>();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [reply, setReply] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tickets', page, pageSize, status],
    queryFn: () => request<any>({ url: '/admin/tickets', params: { page, pageSize, status } }),
  });

  const { data: detail } = useQuery({
    queryKey: ['admin', 'ticket-detail', activeId],
    queryFn: () => request<any>({ url: `/admin/tickets/${activeId}` }),
    enabled: !!activeId,
    refetchInterval: 5000,
  });

  const replyMutation = useMutation({
    mutationFn: () => request({ url: `/admin/tickets/${activeId}/reply`, method: 'POST', data: { content: reply } }),
    onSuccess: () => {
      message.success('已回复');
      setReply('');
      qc.invalidateQueries({ queryKey: ['admin', 'ticket-detail', activeId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const setStatusMutation = useMutation({
    mutationFn: (s: string) => request({ url: `/admin/tickets/${activeId}/status`, method: 'POST', data: { status: s } }),
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['admin', 'ticket-detail', activeId] });
      qc.invalidateQueries({ queryKey: ['admin', 'tickets'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="状态" style={{ width: 160 }} options={STATUS_OPTIONS} onChange={(v) => { setStatus(v); setPage(1); }} />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items ?? []}
        pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户', dataIndex: 'username', width: 130 },
          { title: '类型', dataIndex: 'type', width: 100 },
          { title: '标题', dataIndex: 'subject', ellipsis: true },
          { title: '优先级', dataIndex: 'priority', width: 90 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (v) => <Tag color={v === 'open' || v === 'pending' ? 'orange' : v === 'resolved' ? 'green' : 'default'}>{v}</Tag>,
          },
          { title: '更新时间', dataIndex: 'updatedAt', width: 160, render: (v) => dayjs(v).format('MM-DD HH:mm') },
          {
            title: '操作',
            key: 'op',
            width: 100,
            render: (_, row: any) => <Button size="small" onClick={() => setActiveId(row.id)}>查看</Button>,
          },
        ]}
      />

      <Drawer
        title={detail ? `工单 #${detail.id} - ${detail.subject}` : '工单详情'}
        open={!!activeId}
        onClose={() => setActiveId(null)}
        width={720}
      >
        {detail && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Tag color="blue">{detail.type}</Tag>
              <Tag>{detail.priority}</Tag>
              <Select
                value={detail.status}
                style={{ width: 140 }}
                options={STATUS_OPTIONS}
                onChange={(v) => setStatusMutation.mutate(v)}
              />
            </Space>
            <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 8, background: '#1f1f1f', borderRadius: 6 }}>
              {(detail.replies ?? []).map((r: any) => (
                <div
                  key={r.id}
                  style={{
                    background: r.senderType === 'admin' ? '#2c1f00' : '#262626',
                    padding: 10,
                    marginBottom: 8,
                    borderRadius: 6,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {r.senderType === 'admin' ? '客服' : '用户'} · {dayjs(r.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                  </div>
                  <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.content}</div>
                </div>
              ))}
            </div>
            <Input.TextArea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="输入回复…" style={{ marginTop: 16 }} />
            <Button type="primary" block style={{ marginTop: 8 }} onClick={() => reply.trim() && replyMutation.mutate()} loading={replyMutation.isPending}>
              发送回复
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
