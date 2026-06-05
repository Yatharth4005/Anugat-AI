import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const faculty = await prisma.faculty.findUnique({
      where: { email },
      include: { department: { select: { id: true, name: true, shortCode: true } } },
    });

    if (!faculty || faculty.status === 'ARCHIVED') {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (faculty.deletedAt) {
      res.status(401).json({ success: false, error: 'Account has been deactivated' });
      return;
    }

    const isValid = await bcrypt.compare(password, faculty.passwordHash);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) throw new Error('JWT_SECRET not configured');

    const token = jwt.sign(
      { userId: faculty.id, role: faculty.role, email: faculty.email },
      secret,
      { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as any }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: faculty.id,
          name: faculty.name,
          email: faculty.email,
          role: faculty.role,
          departmentId: faculty.departmentId,
          department: faculty.department,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const faculty = await prisma.faculty.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        initials: true,
        department: { select: { id: true, name: true, shortCode: true } },
      },
    });

    if (!faculty) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: faculty });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout (client just discards token, but we log it)
authRouter.post('/logout', authenticate, (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});
