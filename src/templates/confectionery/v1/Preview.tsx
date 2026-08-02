import { TemplatePreviewStub } from '../../shared/TemplatePreviewStub';
import type { TemplatePreviewProps } from '../../shared/types';
import { metadata } from './metadata';

export function Preview(props: TemplatePreviewProps) {
  return <TemplatePreviewStub metadata={metadata} {...props} />;
}
