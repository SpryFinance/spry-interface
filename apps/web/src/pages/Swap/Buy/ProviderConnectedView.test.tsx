import { ProviderConnectedView } from '~/pages/Swap/Buy/ProviderConnectedView'
import { mockServiceProvider } from '~/pages/Swap/Buy/test/constants'
import { fireEvent, render, screen } from '~/test-utils/render'

describe('ProviderConnectedView', () => {
  it('should render the component and call callbacks', () => {
    const closeModal = vi.fn()

    const { container } = render(
      <ProviderConnectedView closeModal={closeModal} selectedServiceProvider={mockServiceProvider} />,
    )

    expect(container.firstChild).toMatchSnapshot()

    fireEvent.click(screen.getByTestId('ConnectingViewWrapper-close'))
    expect(closeModal).toHaveBeenCalled()
    screen.getByText('Go to the Test Provider tab to continue. It’s safe to close this modal now.')
  })
})
