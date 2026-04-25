import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Select, Space, Table, Tag, Modal } from 'antd';
import { request } from '../lib/api';

type AgrType = 'terms' | 'privacy' | 'risk';

interface AgreementsState {
  [k: string]: { current: string | null; versions: { version: string; updatedAt: string }[] };
}

const TYPES: { value: AgrType; label: string }[] = [
  { value: 'terms', label: '用户协议' },
  { value: 'privacy', label: '隐私政策' },
  { value: 'risk', label: '风险揭示' },
];

export default function Agreements() {
  const [data, setData] = useState<AgreementsState>({});
  const [editing, setEditing] = useState<{ type: AgrType; version: string } | null>(null);
  const [content, setContent] = useState('');
  const [form] = Form.useForm();

  async function load() {
    const r = await request<AgreementsState>({ url: '/admin/agreements' });
    setData(r);
  }
  useEffect(() => {
    void load();
  }, []);

  async function openEdit(type: AgrType, version: string) {
    const r = await request<{ content: string }>({
      url: `/admin/agreements/content?type=${type}&version=${encodeURIComponent(version)}`,
    });
    setContent(r.content ?? '');
    setEditing({ type, version });
  }

  async function handleNew(values: { type: AgrType; version: string; content: string }) {
    await request({
      url: '/admin/agreements/upsert',
      method: 'POST',
      data: values,
    });
    message.success('已保存');
    form.resetFields();
    await load();
  }

  async function handleSave() {
    if (!editing) return;
    await request({
      url: '/admin/agreements/upsert',
      method: 'POST',
      data: { agreementType: editing.type, version: editing.version, content },
    });
    message.success('已保存');
    setEditing(null);
    await load();
  }

  async function handlePublish(type: AgrType, version: string) {
    await request({
      url: '/admin/agreements/publish',
      method: 'POST',
      data: { agreementType: type, version },
    });
    message.success('已发布为生效版本');
    await load();
  }

  return (
    <div>
      <h2>用户协议管理</h2>

      <Card title="新增/更新协议版本" style={{ marginBottom: 24 }}>
        <Form form={form} layout="vertical" onFinish={handleNew}>
          <Form.Item label="协议类型" name="agreementType" rules={[{ required: true }]}>
            <Select options={TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
          <Form.Item label="版本号 (例: 1.0, 2024.01)" name="version" rules={[{ required: true, max: 16 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="内容 (HTML / 纯文本)" name="content" rules={[{ required: true, min: 10 }]}>
            <Input.TextArea rows={10} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            保存
          </Button>
        </Form>
      </Card>

      {TYPES.map((t) => {
        const cur = data[t.value]?.current;
        const versions = data[t.value]?.versions ?? [];
        return (
          <Card key={t.value} title={t.label} style={{ marginBottom: 16 }}>
            <p>
              当前生效版本：{cur ? <Tag color="green">{cur}</Tag> : <Tag>未发布</Tag>}
            </p>
            <Table
              size="small"
              rowKey="version"
              dataSource={versions}
              columns={[
                { title: '版本', dataIndex: 'version' },
                {
                  title: '更新时间',
                  dataIndex: 'updatedAt',
                  render: (v: string) => new Date(v).toLocaleString(),
                },
                {
                  title: '操作',
                  render: (_: any, r: { version: string }) => (
                    <Space>
                      <Button size="small" onClick={() => void openEdit(t.value, r.version)}>
                        编辑
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        disabled={cur === r.version}
                        onClick={() => void handlePublish(t.value, r.version)}
                      >
                        发布
                      </Button>
                    </Space>
                  ),
                },
              ]}
              pagination={false}
            />
          </Card>
        );
      })}

      <Modal
        title={`编辑 ${editing?.type} v${editing?.version}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        width={760}
      >
        <Input.TextArea rows={20} value={content} onChange={(e) => setContent(e.target.value)} />
      </Modal>
    </div>
  );
}
