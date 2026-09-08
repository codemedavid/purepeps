import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProtocolManager from './ProtocolManager';
import { allMockProtocols, mockImageProtocol } from '../test/mocks';

// Mock useProtocols hook
const mockAddProtocol = vi.fn().mockResolvedValue({ success: true });
const mockUpdateProtocol = vi.fn().mockResolvedValue({ success: true });
const mockDeleteProtocol = vi.fn().mockResolvedValue({ success: true });
const mockToggleActive = vi.fn().mockResolvedValue({ success: true });

vi.mock('../hooks/useProtocols', () => ({
  useProtocols: () => ({
    protocols: allMockProtocols,
    loading: false,
    addProtocol: mockAddProtocol,
    updateProtocol: mockUpdateProtocol,
    deleteProtocol: mockDeleteProtocol,
    toggleActive: mockToggleActive,
  }),
}));

// Mock useImageUpload hook
const mockUploadImage = vi.fn().mockResolvedValue('https://test.supabase.co/storage/v1/object/public/protocol-files/uploaded.png');

vi.mock('../hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    uploadImage: mockUploadImage,
    uploading: false,
    uploadProgress: 0,
  }),
}));

describe('ProtocolManager', () => {
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering Tests ---

  describe('rendering', () => {
    it('renders the protocol list', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByText('GHK-Cu Protocol')).toBeInTheDocument();
      expect(screen.getByText('BPC-157 Protocol')).toBeInTheDocument();
      expect(screen.getByText('Hidden Protocol')).toBeInTheDocument();
    });

    it('shows content type badges for file and image protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      // These are the badge spans in the protocol list
      const fileBadges = screen.getAllByText('File');
      const imageBadges = screen.getAllByText('Image');
      expect(fileBadges.length).toBeGreaterThanOrEqual(1);
      expect(imageBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('shows dosage info for text protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText(/2\.5mg - 15mg/)).toBeInTheDocument();
    });

    it('shows "File attached" for file protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('File attached')).toBeInTheDocument();
    });

    it('shows "Image attached" for image protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Image attached')).toBeInTheDocument();
    });

    it('shows Hidden badge for inactive protocols', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Hidden')).toBeInTheDocument();
    });

    it('shows Add Protocol button', () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      expect(screen.getByText('Add Protocol')).toBeInTheDocument();
    });
  });

  // --- Add Protocol Form Tests ---

  describe('add protocol form', () => {
    it('opens add form when clicking Add Protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByText(/Add New Protocol/)).toBeInTheDocument();
    });

    it('shows content type selector with Text, File, Image buttons', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByText('Protocol Content Type *')).toBeInTheDocument();
      expect(screen.getByText('Text')).toBeInTheDocument();
    });

    it('shows text fields by default (text content type)', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Once weekly')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., 12-16 weeks')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Refrigerate at 2-8°C')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter each note on a new line...')).toBeInTheDocument();
    });

    it('shows file upload area when File content type is selected', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      // Find the content type File button (has border-2 class)
      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      expect(fileTypeButton).toBeDefined();
      await userEvent.click(fileTypeButton!);

      expect(screen.getByText('Click to upload a file')).toBeInTheDocument();
      expect(screen.getByText('PDF, DOC, DOCX, TXT, XLS, XLSX')).toBeInTheDocument();
    });

    it('shows image upload area when Image content type is selected', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      const imageButtons = screen.getAllByText('Image');
      const imageTypeButton = imageButtons.find(el => el.closest('button')?.className.includes('border-2'));
      expect(imageTypeButton).toBeDefined();
      await userEvent.click(imageTypeButton!);

      expect(screen.getByText('Click to upload an image')).toBeInTheDocument();
      expect(screen.getByText('JPG, PNG, WebP, GIF, etc.')).toBeInTheDocument();
    });

    it('hides text fields when switching to file content type', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      expect(screen.queryByPlaceholderText('e.g., 2.5mg - 15mg')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('e.g., Once weekly')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter each note on a new line...')).not.toBeInTheDocument();
    });

    it('switches back to text fields when selecting Text content type', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      expect(screen.queryByPlaceholderText('e.g., 2.5mg - 15mg')).not.toBeInTheDocument();

      await userEvent.click(screen.getByText('Text'));

      expect(screen.getByPlaceholderText('e.g., 2.5mg - 15mg')).toBeInTheDocument();
    });
  });

  // --- Save Protocol Tests ---

  describe('saving protocols', () => {
    it('saves a text protocol with all fields', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test Protocol');
      await userEvent.click(screen.getByRole('button', { name: 'Weight Loss' }));
      await userEvent.type(screen.getByPlaceholderText('e.g., 2.5mg - 15mg'), '5mg');

      await userEvent.click(screen.getByText('Save Protocol'));

      await waitFor(() => {
        expect(mockAddProtocol).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Test Protocol',
            category: 'Weight Loss',
            dosage: '5mg',
            content_type: 'text',
            file_url: null,
          })
        );
      });
    });

    it('validates name and category are required', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Please fill in name and pick at least one category',
      );
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates dosage is required for text content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.click(screen.getByRole('button', { name: 'Weight Loss' }));

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please fill in dosage for text protocols');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates file is required for file content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.click(screen.getByRole('button', { name: 'Weight Loss' }));

      const fileButtons = screen.getAllByText('File');
      const fileTypeButton = fileButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(fileTypeButton!);

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please upload a file');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });

    it('validates image is required for image content type', async () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));

      await userEvent.type(screen.getByPlaceholderText('e.g., Tirzepatide'), 'Test');
      await userEvent.click(screen.getByRole('button', { name: 'Weight Loss' }));

      const imageButtons = screen.getAllByText('Image');
      const imageTypeButton = imageButtons.find(el => el.closest('button')?.className.includes('border-2'));
      await userEvent.click(imageTypeButton!);

      await userEvent.click(screen.getByText('Save Protocol'));

      expect(alertSpy).toHaveBeenCalledWith('Please upload a image');
      expect(mockAddProtocol).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });

  // --- Edit Protocol Tests ---

  describe('editing protocols', () => {
    it('populates form with protocol data when editing a text protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[0]); // Edit Tirzepatide (text)

      expect(screen.getByDisplayValue('Tirzepatide')).toBeInTheDocument();
      expect(screen.getByDisplayValue('2.5mg - 15mg')).toBeInTheDocument();
      // "Weight Management" is a legacy label; the picker resolves it onto the
      // canonical Weight Loss chip and shows THAT as selected, which is how the
      // duplicate option stops being recreated on the next save.
      expect(screen.getByRole('button', { name: 'Weight Loss' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('populates form with image content type when editing an image protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[1]); // Edit GHK-Cu Protocol (image)

      expect(screen.getByDisplayValue('GHK-Cu Protocol')).toBeInTheDocument();
      // Should show image preview since file_url exists
      const imgs = screen.getAllByAltText('Protocol preview');
      expect(imgs.length).toBeGreaterThanOrEqual(1);
      expect(imgs[0]).toHaveAttribute('src', mockImageProtocol.file_url);
    });

    it('populates form with file content type when editing a file protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const editButtons = screen.getAllByTitle('Edit');
      await userEvent.click(editButtons[2]); // Edit BPC-157 Protocol (file)

      expect(screen.getByDisplayValue('BPC-157 Protocol')).toBeInTheDocument();
      expect(screen.getByText('File already uploaded')).toBeInTheDocument();
      expect(screen.getByText('View current file')).toBeInTheDocument();
    });
  });

  // --- Delete & Toggle Tests ---

  describe('delete and toggle', () => {
    it('calls deleteProtocol when delete is confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<ProtocolManager onBack={mockOnBack} />);

      const deleteButtons = screen.getAllByTitle('Delete');
      await userEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(mockDeleteProtocol).toHaveBeenCalledWith('proto-1');
      });
    });

    it('does not delete when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<ProtocolManager onBack={mockOnBack} />);

      const deleteButtons = screen.getAllByTitle('Delete');
      await userEvent.click(deleteButtons[0]);

      expect(mockDeleteProtocol).not.toHaveBeenCalled();
    });

    it('toggles active state on first active protocol', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const hideButtons = screen.getAllByTitle('Hide from website');
      await userEvent.click(hideButtons[0]);

      await waitFor(() => {
        expect(mockToggleActive).toHaveBeenCalled();
      });
    });
  });

  // --- Cancel Tests ---

  describe('cancel', () => {
    it('closes form when Cancel is clicked', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      await userEvent.click(screen.getByText('Add Protocol'));
      expect(screen.getByText(/Add New Protocol/)).toBeInTheDocument();

      await userEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText(/Add New Protocol/)).not.toBeInTheDocument();
    });
  });

  // --- Back Button ---

  describe('navigation', () => {
    it('calls onBack when back button is clicked', async () => {
      render(<ProtocolManager onBack={mockOnBack} />);

      const buttons = screen.getAllByRole('button');
      await userEvent.click(buttons[0]); // First button is the back arrow

      expect(mockOnBack).toHaveBeenCalled();
    });
  });
});
