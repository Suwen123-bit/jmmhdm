import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  message,
  DatePicker,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { request } from '../lib/api';

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'critical';
  priority: number;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
}

const TYPE_COLOR: Record<string, string> = {
  info: 'blue',
  warning: 'gold',
  success: 'green',
  critical: 'red',
};

export default function Announcements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Partial<Announcement> | null>(null);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const r = await request<{ items: Announcement[] }>({ url: '/admin/announcements' });
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing({ type: 'info', priority: 0, isActive: true });
    form.resetFields();
    form.setFieldsValue({ type: 'info', priority: 0, isActive: true });
  }

  function openEdit(row: Announcement) {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      startAt: row.startAt ? dayjs(row.startAt) : null,
      endAt: row.endAt ? dayjs(row.endAt) : null,
    });
  }

  async function handleSave() {
    const values = await form.validateFields();
    const payload: any = {
      ...values,
      id: editing?.id,
      startAt: values.startAt ? (values.startAt as Dayjs).toISOString() : null,
      endAt: values.endAt ? (values.endAt as Dayjs).toISOString() : null,
    };
    await request({ url: '/admin/announcements/upsert', method: 'POST', data: payload });
    message.success('已保存');
    setEditing(null);
    await load();
  }

  async function handleDelete(id: number) {
    await request({ url: '/admin/announcements/delete', method: 'POST', data: { id } });
    message.success('已删除');
    await load();
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>公告管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建公告
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={items}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 60 },
          { title: '标题', dataIndex: 'title' },
          {
            title: '类型',
            dataIndex: 'type',
            width: 100,
            render: (t: string) => <Tag color={TYPE_COLOR[t]}>{t}</Tag>,
          },
          { title: '优先级', dataIndex: 'priority', width: 80 },
          {
            title: '状态',
            dataIndex: 'isActive',
            width: 80,
            render: (v: boolean) => (v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
          },
          {
            title: '生效区间',
            width: 280,
            render: (_: any, r: Announcement) =>
              `${r.startAt ? dayjs(r.startAt).format('MM-DD HH:mm') : '∞'} ~ ${r.endAt ? dayjs(r.endAt).format('MM-DD HH:mm') : '∞'}`,
          },
          {
            title: '操作',
            width: 160,
            render: (_: any, r: Announcement) => (
              <>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} style={{ marginRight: 8 }}>
                  编辑
                </Button>
                <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </>
            ),
          },
        ]}
      />

      <Modal
        title={editing?.id ? '编辑公告' : '新建公告'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="标题" name="title" rules={[{ required: true, max: 200 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="内容" name="content" rules={[{ required: true, max: 20000 }]}>
            <Input.TextArea rows={6} />
          </Form.Item>
          <Form.Item label="类型" name="type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'info', label: '提示 (info)' },
                { value: 'warning', label: '警告 (warning)' },
                { value: 'success', label: '成功 (success)' },
                { value: 'critical', label: '严重 (critical)' },
              ]}
            />
          </Form.Item>
          <Form.Item label="优先级" name="priority">
            <InputNumber min={0} max={100} />
          </Form.Item>
          <Form.Item label="启用" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="开始时间" name="startAt">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="结束时间" name="endAt">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
