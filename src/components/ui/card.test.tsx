import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

describe('Card', () => {
  it('renders a div with the token-based card chrome classes', () => {
    render(<Card>Card body</Card>);
    const card = screen.getByText('Card body');
    expect(card.tagName).toBe('DIV');
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('border');
    expect(card.className).toContain('rounded-lg');
  });

  it('reproduces the Fluent medium-Card interior layout (padding/gap/stack)', () => {
    render(<Card>Card body</Card>);
    const card = screen.getByText('Card body');
    expect(card.className).toContain('p-3');
    expect(card.className).toContain('flex');
    expect(card.className).toContain('flex-col');
    expect(card.className).toContain('gap-3');
  });

  it('merges a custom className onto Card', () => {
    render(<Card className="my-custom-class">Custom</Card>);
    const card = screen.getByText('Custom');
    expect(card.className).toContain('my-custom-class');
    expect(card.className).toContain('bg-card');
  });
});

describe('CardHeader', () => {
  it('renders children as a bare div', () => {
    render(<CardHeader>Header content</CardHeader>);
    const header = screen.getByText('Header content');
    expect(header.tagName).toBe('DIV');
  });

  it('merges a passed className', () => {
    render(<CardHeader className="header-class">Header</CardHeader>);
    expect(screen.getByText('Header').className).toContain('header-class');
  });
});

describe('CardTitle', () => {
  it('renders as an h3 element with its children', () => {
    render(<CardTitle>My Title</CardTitle>);
    const title = screen.getByText('My Title');
    expect(title.tagName).toBe('H3');
  });

  it('merges a passed className', () => {
    render(<CardTitle className="title-class">Title</CardTitle>);
    expect(screen.getByText('Title').className).toContain('title-class');
  });
});

describe('CardDescription', () => {
  it('renders as a p element with its children', () => {
    render(<CardDescription>Some description</CardDescription>);
    const desc = screen.getByText('Some description');
    expect(desc.tagName).toBe('P');
  });

  it('merges a passed className', () => {
    render(<CardDescription className="desc-class">Desc</CardDescription>);
    expect(screen.getByText('Desc').className).toContain('desc-class');
  });
});

describe('CardContent', () => {
  it('renders children as a bare div without stock shadcn padding', () => {
    render(<CardContent>x</CardContent>);
    const content = screen.getByText('x');
    expect(content.tagName).toBe('DIV');
    // Guard against regressing all 195 cards with double padding.
    expect(content.className).not.toContain('p-6');
  });

  it('merges a passed className', () => {
    render(<CardContent className="content-class">Content</CardContent>);
    expect(screen.getByText('Content').className).toContain('content-class');
  });
});

describe('CardFooter', () => {
  it('renders children as a bare div', () => {
    render(<CardFooter>Footer content</CardFooter>);
    const footer = screen.getByText('Footer content');
    expect(footer.tagName).toBe('DIV');
  });

  it('merges a passed className', () => {
    render(<CardFooter className="footer-class">Footer</CardFooter>);
    expect(screen.getByText('Footer').className).toContain('footer-class');
  });
});
