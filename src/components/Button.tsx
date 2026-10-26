import type { ButtonHTMLAttributes } from 'react';
import { play } from '../lib/audio';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  size?: 'md' | 'lg' | 'sm';
}

export function Button({ variant = 'primary', size = 'md', className = '', onClick, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`btn btn--${variant} btn--${size} ${className}`}
      onClick={(e) => {
        play('click');
        onClick?.(e);
      }}
    />
  );
}
