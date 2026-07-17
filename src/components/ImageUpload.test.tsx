import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Label } from './ui/label';
import { ImageUpload } from './ImageUpload';

const setup = (props: Partial<React.ComponentProps<typeof ImageUpload>> = {}) => {
  const onFileSelect = vi.fn();
  const utils = render(
    <div>
      <Label htmlFor="image">Cover image</Label>
      <ImageUpload id="image" value="" onFileSelect={onFileSelect} {...props} />
    </div>,
  );
  return { onFileSelect, ...utils };
};

const pickFile = async (input: HTMLElement, file: File) => {
  await userEvent.upload(input, file);
};

describe('ImageUpload — label binding', () => {
  it('forwards id to the file input so <Label htmlFor="image"> binds to it', () => {
    setup();
    // getByLabelText only succeeds if the <label htmlFor> resolves to a real control.
    expect(screen.getByLabelText('Cover image')).toBe(screen.getByTestId('image-upload-input'));
  });
});

describe('ImageUpload — selection and removal', () => {
  it('reports a picked file and lets the user remove the pending selection', async () => {
    const { onFileSelect } = setup();
    const file = new File(['data'], 'photo.png', { type: 'image/png' });

    await pickFile(screen.getByTestId('image-upload-input'), file);

    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(screen.getByTestId('image-preview')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('image-remove'));
    expect(onFileSelect).toHaveBeenLastCalledWith(null);
  });

  it('rejects an unsupported file type without calling onFileSelect', async () => {
    const { onFileSelect } = setup();
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });

    await pickFile(screen.getByTestId('image-upload-input'), file);

    expect(onFileSelect).not.toHaveBeenCalled();
  });
});

describe('ImageUpload — upload-in-progress state', () => {
  it('shows a status region and locks the drop zone while uploading', () => {
    setup({ uploading: true });

    expect(screen.getByRole('status')).toHaveTextContent(/uploading image/i);
    expect(screen.getByTestId('image-drop-zone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('image-upload-input')).toBeDisabled();
  });

  it('does not show the status region when idle', () => {
    setup();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('hides the Remove action for a pending file while it is uploading', async () => {
    const { rerender, onFileSelect } = setup();
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    await pickFile(screen.getByTestId('image-upload-input'), file);
    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(screen.getByTestId('image-remove')).toBeInTheDocument();

    rerender(
      <div>
        <Label htmlFor="image">Cover image</Label>
        <ImageUpload id="image" value="" onFileSelect={onFileSelect} uploading />
      </div>,
    );

    expect(screen.queryByTestId('image-remove')).not.toBeInTheDocument();
  });
});

describe('ImageUpload — fully read-only (disabled)', () => {
  it('renders only a static preview, no drop zone', () => {
    setup({ disabled: true, value: 'https://example.com/cover.png' });
    expect(screen.getByTestId('image-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('image-drop-zone')).not.toBeInTheDocument();
  });

  it('renders nothing when disabled with no saved value', () => {
    setup({ disabled: true, value: '' });
    expect(screen.queryByTestId('image-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('image-drop-zone')).not.toBeInTheDocument();
  });
});
