import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Statistic } from 'antd';
import {
  UserOutlined,
  WalletOutlined,
  RiseOutlined,
  FallOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { request } from '../lib/api';

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => request<any>({ url: '/admin/dashboard' }),
    refetchInterval: 30000,
  });

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="用户总数" value={data?.users?.total ?? 0} prefix={<UserOutlined />} />
          <div style={{ marginTop: 8, color: '#52c41a' }}>今日新增 {data?.users?.today ?? 0}</div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="今日充值 (USDT)" value={data?.deposit?.today ?? 0} prefix={<RiseOutlined />} precision={2} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="今日提现 (USDT)" value={data?.withdraw?.today ?? 0} prefix={<FallOutlined />} precision={2} />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="今日交易笔数" value={data?.trade?.todayCount ?? 0} prefix={<WalletOutlined />} />
          <div style={{ marginTop: 8 }}>持仓中: {data?.trade?.open ?? 0}</div>
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="今日交易额" value={data?.trade?.todayVolume ?? 0} precision={2} suffix="USDT" />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic
            title="今日平台盈亏"
            value={data?.trade?.todayPnL ?? 0}
            precision={2}
            suffix="USDT"
            valueStyle={{ color: Number(data?.trade?.todayPnL) >= 0 ? '#52c41a' : '#ff4d4f' }}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} md={8} lg={6}>
        <Card>
          <Statistic title="盲盒累计销售" value={data?.blindbox?.totalSold ?? 0} prefix={<GiftOutlined />} />
        </Card>
      </Col>

      {/* 近 7 日趋势图 */}
      <Col xs={24} lg={12}>
        <Card title="近 7 日交易额 (USDT)">
          <ReactECharts
            style={{ height: 280 }}
            option={{
              tooltip: { trigger: 'axis' },
              grid: { left: 40, right: 20, top: 30, bottom: 30 },
              xAxis: {
                type: 'category',
                data: data?.trends?.dates ?? [],
              },
              yAxis: { type: 'value' },
              series: [
                {
                  name: '交易额',
                  type: 'line',
                  smooth: true,
                  data: data?.trends?.tradeVolume ?? [],
                  areaStyle: { opacity: 0.2 },
                  lineStyle: { color: '#f7b500' },
                  itemStyle: { color: '#f7b500' },
                },
              ],
            }}
          />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title="近 7 日充提对比 (USDT)">
          <ReactECharts
            style={{ height: 280 }}
            option={{
              tooltip: { trigger: 'axis' },
              legend: { data: ['充值', '提现'] },
              grid: { left: 40, right: 20, top: 40, bottom: 30 },
              xAxis: {
                type: 'category',
                data: data?.trends?.dates ?? [],
              },
              yAxis: { type: 'value' },
              series: [
                {
                  name: '充值',
                  type: 'bar',
                  data: data?.trends?.deposit ?? [],
                  itemStyle: { color: '#16c784' },
                },
                {
                  name: '提现',
                  type: 'bar',
                  data: data?.trends?.withdraw ?? [],
                  itemStyle: { color: '#ea3943' },
                },
              ],
            }}
          />
        </Card>
      </Col>
    </Row>
  );
}
