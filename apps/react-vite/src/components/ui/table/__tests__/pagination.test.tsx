import { MemoryRouter, useSearchParams } from 'react-router';

import { TablePagination } from '@/components/ui/table/pagination';
import { rtlRender, screen, userEvent } from '@/testing/test-utils';

const PaginationRoute = ({ rootUrl }: { rootUrl: string }) => {
  const [searchParams] = useSearchParams();

  return (
    <TablePagination
      currentPage={Number(searchParams.get('page') || 1)}
      totalPages={4}
      rootUrl={rootUrl}
    />
  );
};

test.each(['', '/app/discussions'])(
  'should navigate sequentially with rootUrl "%s"',
  async (rootUrl) => {
    rtlRender(
      <MemoryRouter initialEntries={['/app/discussions?page=1']}>
        <PaginationRoute rootUrl={rootUrl} />
      </MemoryRouter>,
    );

    const nextLink = screen.getByRole('link', { name: 'Go to next page' });
    expect(nextLink).toHaveAttribute('href', '/app/discussions?page=2');

    await userEvent.click(nextLink);

    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent(
      '2',
    );
    expect(
      screen.getByRole('link', { name: 'Go to next page' }),
    ).toHaveAttribute('href', '/app/discussions?page=3');

    const previousLink = screen.getByRole('link', {
      name: 'Go to previous page',
    });
    expect(previousLink).toHaveAttribute('href', '/app/discussions?page=1');

    await userEvent.click(previousLink);

    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent(
      '1',
    );
  },
);

test.each([
  { currentPage: 1, totalPages: 4, previous: false, next: true },
  { currentPage: 4, totalPages: 4, previous: true, next: false },
  { currentPage: 1, totalPages: 1, previous: false, next: false },
])(
  'should respect boundaries on page $currentPage of $totalPages',
  ({ currentPage, totalPages, previous, next }) => {
    rtlRender(
      <MemoryRouter>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          rootUrl="/app/discussions"
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryAllByRole('link', { name: 'Go to previous page' }),
    ).toHaveLength(previous ? 1 : 0);
    expect(
      screen.queryAllByRole('link', { name: 'Go to next page' }),
    ).toHaveLength(next ? 1 : 0);
  },
);

test('should expose only the current page as active', () => {
  rtlRender(
    <MemoryRouter>
      <TablePagination currentPage={3} totalPages={5} rootUrl="" />
    </MemoryRouter>,
  );

  const activeLinks = screen.getAllByRole('link', { current: 'page' });
  expect(activeLinks).toHaveLength(1);
  expect(activeLinks[0]).toHaveAccessibleName('3');
  expect(activeLinks[0]).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '2' })).not.toHaveAttribute(
    'aria-current',
  );
  expect(screen.getByRole('link', { name: '4' })).not.toHaveAttribute(
    'aria-current',
  );
});
