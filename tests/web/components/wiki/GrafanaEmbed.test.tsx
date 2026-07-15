import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { GrafanaEmbed } from '@/components/wiki/GrafanaEmbed'

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: (selector: (s: { theme: string }) => string) =>
    selector({ theme: 'light' }),
}))

describe('GrafanaEmbed', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows unavailable panel when health probe fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))

    render(
      <GrafanaEmbed
        src="http://127.0.0.1:3030/d/test/dashboard"
        title="Test"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Grafana Unavailable')
  })

  it('retries health probe from Try again', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <GrafanaEmbed
        src="http://127.0.0.1:3030/d/test/dashboard"
        title="Test"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Service Unavailable')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => {
      expect(screen.getByTitle('Test')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})