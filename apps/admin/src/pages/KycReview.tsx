import { useEffect, useState } from 'react';
import { Button, Image, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { request } from '../lib/api';

interface KycApp {
  id: number;
  userId: number;
  username: string;
  level: number;
  status: 'pending' | 'approved' | 'rejected';
  realName: string;
  idType: string;
  idNumber: string;
  idFrontUrl: string;
  idBackUrl: string | null;
  selfieUrl: string | null;
  reviewNote: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
};

export default function KycReview() {
  const [items, setItems] = useState<KycApp[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [loading, setLoading] = useState(false);

  const [reviewing, setReviewing] = useState<KycApp | null>(null);
  const [note, setNote] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await request<{ items: KycApp[]; total: number }>({
        url: '/admin/kyc',
        params: { status: statusFilter || undefined, page, pageSize },
      });
      setItems(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page, statusFilter]);

  async function handleAction(action: 'approve' | 'reject') {
    if (!reviewing) return;
    if (action === 'reject' && !note) {
      message.warning('拒绝必须填写备注');
      return;
    }
    await request({
      url: '/admin/kyc/review',
      method: 'POST',
      data: { applicationId: reviewing.id, action, note },
    });
    message.success(action === 'approve' ? '已通过' : '已拒绝');
    setReviewing(null);
    setNote('');
    await load();
  }

  return (
    <div>
      <h2>KYC 审核</h2>
      <Space style={{ marginBottom: 12 }}>
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          style={{ width: 160 }}
          options={[
            { value: '', label: '全部状态' },
            { value: 'pending', label: '待审' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已拒绝' },
          ]}
        />
        <Button onClick={() => void load()}>刷新</Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        pagination={{ current: page, pageSize, total, onChange: setPage }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '用户', dataIndex: 'username' },
          { title: '等级', dataIndex: 'level', width: 60 },
          { title: '姓名', dataIndex: 'realName' },
          { title: '证件号', dataIndex: 'idNumber' },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: string) => <Tag color={STATUS_COLOR[s]}>{s}</Tag>,
          },
          {
            title: '提交时间',
            dataIndex: 'createdAt',
            render: (v: string) => new Date(v).toLocaleString(),
          },
          {
            title: '操作',
            render: (_: any, r: KycApp) => (
              <Button size="small" onClick={() => setReviewing(r)}>
                查看 / 审核
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={`KYC 审核 - L${reviewing?.level}`}
        open={!!reviewing}
        onCancel={() => setReviewing(null)}
        width={760}
        footer={
          reviewing?.status === 'pending' ? (
            <Space>
              <Button danger onClick={() => void handleAction('reject')}>
                拒绝
              </Button>
              <Button type="primary" onClick={() => void handleAction('approve')}>
                通过
              </Button>
            </Space>
          ) : null
        }
      >
        {reviewing && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <p>
              用户：{reviewing.username} · 姓名：{reviewing.realName} · 证件：{reviewing.idType}{' '}
              {reviewing.idNumber}
            </p>
            <Space wrap>
              {reviewing.idFrontUrl && (
                <Image src={reviewing.idFrontUrl} width={200} alt="正面" />
              )}
              {reviewing.idBackUrl && (
                <Image src={reviewing.idBackUrl} width={200} alt="背面" />
              )}
              {reviewing.selfieUrl && (
                <Image src={reviewing.selfieUrl} width={200} alt="自拍" />
              )}
            </Space>
            {reviewing.status === 'pending' && (
              <Input.TextArea
                rows={3}
                placeholder="审核备注（拒绝必填）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
            {reviewing.reviewNote && (
              <p style={{ color: '#aaa' }}>历史备注：{reviewing.reviewNote}</p>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
