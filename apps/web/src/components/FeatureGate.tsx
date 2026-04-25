import type { ReactNode } from 'react';
import { useConfig } from '../store/config';

interface Props {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
}

export function FeatureGate({ feature, fallback, children }: Props) {
  const enabled = useConfig((s) => s.isFeatureEnabled(feature));
  if (!enabled) {
    return (
      fallback ?? (
        <div className="card text-center text-zinc-400">
          <div className="mb-2 text-lg">该功能当前已关闭</div>
          <div className="text-sm">请稍后再试或联系客服</div>
        </div>
      )
    );
  }
  return <>{children}</>;
}
