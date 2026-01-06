import { test, expect } from '@playwright/test';
// Test authentication deliberately
test.describe.skip('Authentication', () => {
  const mockUser = {
    id: '123',
    email: 'test@example.com',
    full_name: 'Test User',
    is_active: true,
  };

  const mockTokenResponse = {
    access_token: 'mock-token-123',
    token_type: 'bearer',
  };

  test('should redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('should login successfully', async ({ page }) => {
    // Mock the API responses
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTokenResponse),
      });
    });

    await page.route('**/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.goto('/login');

    // Fill in the login form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // Submit the form
    await page.click('button[type="submit"]');

    // Verify redirection to dashboard
    await expect(page).toHaveURL('/');
  });

  test('should show error on invalid credentials', async ({ page }) => {
    // Mock the API error response
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Incorrect username or password' }),
      });
    });

    await page.goto('/login');

    // Fill in invalid credentials
    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    
    // Submit the form
    await page.click('button[type="submit"]');

    // Verify error message is displayed
    await expect(page.locator('text=Incorrect username or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/login');
    // Use a more specific selector for the link
    await page.click('a[href="/register"]');
    await expect(page).toHaveURL('/register');
  });

  test('should register successfully', async ({ page }) => {
    // Mock the API responses
    await page.route('**/auth/register', async (route) => {
      await route.fulfill({
        status: 200, // Or 201 created
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    // Register usually triggers login automatically in this app
    await page.route('**/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTokenResponse),
      });
    });

    await page.route('**/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.goto('/register');

    // Fill in registration form
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="email"]', 'new@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL('/'); 
  });
});
