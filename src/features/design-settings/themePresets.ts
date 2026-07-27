import type { ThemeSettings } from '../../entities/models';

export const darkThemePreset: Partial<ThemeSettings> = {
  background_type: 'color',
  background_color: '#070809',
  background_gradient_from: '#070809',
  background_gradient_to: '#1f2937',
  background_image_url: '',
  card_color: '#121416',
  product_card_color: '#121416',
  product_card_text_color: '#f8f5ef',
  settings_card_color: '#121416',
  settings_card_text_color: '#f8f5ef',
  cart_panel_color: '#111111',
  cart_panel_text_color: '#f8f5ef',
  text_primary: '#f8f5ef',
  text_secondary: '#aaa39a',
  product_title_color: '#f8f5ef',
  category_title_color: '#f8f5ef',
  accent_color: '#e8a23a',
  accent_secondary: '#ffd082',
  card_shadow: '0 18px 46px rgba(0, 0, 0, 0.28)'
};

export const lightThemePreset: Partial<ThemeSettings> = {
  background_type: 'color',
  background_color: '#f7f3ec',
  background_gradient_from: '#f7f3ec',
  background_gradient_to: '#ffffff',
  background_image_url: '',
  card_color: '#ffffff',
  product_card_color: '#ffffff',
  product_card_text_color: '#181510',
  settings_card_color: '#ffffff',
  settings_card_text_color: '#181510',
  cart_panel_color: '#ffffff',
  cart_panel_text_color: '#181510',
  text_primary: '#181510',
  text_secondary: '#766d62',
  product_title_color: '#111827',
  category_title_color: '#ffffff',
  card_shadow: '0 18px 46px rgba(45, 35, 20, 0.12)'
};
