'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  // In TypeScript, this is called a string union type.
  // It means that the "status" property can only be one of the two strings: 'pending' or 'paid'.
  status: 'pending' | 'paid';
};

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer',
    required_error: 'A customer is required',
  }),
  amount: z.coerce.number().gt(0, { message: 'Positive dollar amount' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Select an invoice status',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export async function createInvoice(prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const parse = validatedFields.data;

  const date = new Date().toISOString().split('T')[0];
  const amountCents = parse.amount * 100;

  // Test it out:
  console.log({ ...parse, date, amountCents });
  try {
    await sql`insert into invoices (customer_id, amount, date, status) 
                        VALUES (${parse.customerId}, ${amountCents}, ${date}, ${parse.status})`;
  } catch (e) {
    return {
      message: 'Database Error: Failed to create invoice',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(id: string, formData: FormData) {
  console.log(id, Object.fromEntries(formData.entries()));
  const parse = CreateInvoice.parse(Object.fromEntries(formData.entries()));
  const amountCents = parse.amount * 100;

  try {
    await sql`UPDATE INVOICES
              SET customer_id=${parse.customerId},
                  amount=${amountCents},
                  status=${parse.status}
              WHERE id = ${id}`;
  } catch (e) {
    return {
      message: 'Database Error: Failed to update invoice.',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  throw new Error('Failed to delete invoice');
  try {
    await sql`DELETE
              FROM INVOICES
              WHERE id = ${id}`;
  } catch (e) {
    return {
      message: 'Database Error: Failed to delete invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}
