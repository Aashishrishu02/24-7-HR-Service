import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailService } from '../email/email.service.js';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async notifyUpcomingExpiry(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null; expiresAt: Date },
    daysRemaining: number,
  ) {
    const expiryDateStr = vps.expiresAt.toISOString().slice(0, 10);
    const idempotencyKey = `notif-expiry:${vps.id}:${expiryDateStr}:${daysRemaining}d`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`Notification ${idempotencyKey} already sent, skipping`);
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const subject = `⚠️ Important: Your VPS (${vps.ipAddress}) expires in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #d97706;">VPS Expiry Notice</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>Your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) is scheduled to expire on <strong>${expiryDateStr}</strong> (in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}).</p>
        <p>To prevent service disruption or downtime, please ensure your auto-renewal is enabled and your wallet is sufficiently funded, or renew your server manually from your dashboard.</p>
        <div style="margin: 25px 0;">
          <a href="/wallet" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Top Up Wallet</a>
          &nbsp;&nbsp;
          <a href="/my-vps" style="background-color: #4b5563; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Manage VPS</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">24/7 HR Service VPS Hosting Platform</p>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'EXPIRY_WARNING',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `VPS expires in ${daysRemaining} days on ${expiryDateStr}`,
        metadata: { daysRemaining, expiryDate: expiryDateStr, ipAddress: vps.ipAddress },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyRenewalSuccess(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null },
    amount: number | string,
    newExpiresAt: Date,
    cycleId: string,
  ) {
    const idempotencyKey = `notif-renewal-success:${vps.id}:${cycleId}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const newExpiryStr = newExpiresAt.toISOString().slice(0, 10);
    const subject = `✅ Auto-Renewal Successful for VPS (${vps.ipAddress})`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #059669;">VPS Auto-Renewed Successfully</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>Your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) has been automatically renewed.</p>
        <ul>
          <li><strong>Amount Deducted:</strong> ₹${amount}</li>
          <li><strong>Payment Method:</strong> 24/7 Wallet Debit</li>
          <li><strong>New Expiry Date:</strong> ${newExpiryStr}</li>
        </ul>
        <p>Thank you for hosting with 24/7 HR Service VPS.</p>
        <div style="margin: 20px 0;">
          <a href="/my-vps" style="background-color: #059669; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">View My Servers</a>
        </div>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'RENEWAL_SUCCESS',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `Auto-renewal successful for ₹${amount}. New expiry: ${newExpiryStr}`,
        metadata: { amount, newExpiresAt: newExpiryStr, cycleId },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyRenewalFailed(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null },
    reason: string,
    cycleId: string,
  ) {
    const idempotencyKey = `notif-renewal-failed:${vps.id}:${cycleId}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const subject = `❌ Auto-Renewal Failed for VPS (${vps.ipAddress})`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #dc2626;">VPS Auto-Renewal Failed</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>An attempt to automatically renew your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) could not be completed.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please check your wallet balance or contact support to avoid server suspension.</p>
        <div style="margin: 20px 0;">
          <a href="/wallet" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Check Wallet</a>
          &nbsp;&nbsp;
          <a href="/support" style="background-color: #4b5563; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Contact Support</a>
        </div>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'RENEWAL_FAILED',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `Auto-renewal failed: ${reason}`,
        metadata: { reason, cycleId },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyInsufficientBalance(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null; expiresAt?: Date | null },
    renewalAmount: number | string,
    currentBalance: number | string,
    shortfall: number | string,
  ) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `notif-insufficient-balance:${vps.id}:${todayStr}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      this.logger.debug(`Low balance notification ${idempotencyKey} already sent today, skipping`);
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const expiryStr = vps.expiresAt ? vps.expiresAt.toISOString().slice(0, 10) : 'Soon';
    const subject = `⚠️ Insufficient Wallet Balance for VPS Auto-Renewal (${vps.ipAddress})`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #dc2626;">Insufficient Funds for Auto-Renewal</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>Your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) has auto-renewal enabled, but your wallet balance is insufficient to cover the renewal fee.</p>
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>Renewal Price:</strong> ₹${renewalAmount}</p>
          <p style="margin: 4px 0;"><strong>Current Wallet Balance:</strong> ₹${currentBalance}</p>
          <p style="margin: 4px 0; color: #b91c1c;"><strong>Shortfall Required:</strong> ₹${shortfall}</p>
          <p style="margin: 4px 0;"><strong>Expiry Date:</strong> ${expiryStr}</p>
        </div>
        <p>To avoid service suspension, please add funds to your wallet now. Once funded, the system will automatically renew your VPS.</p>
        <div style="margin: 25px 0;">
          <a href="/wallet" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Top Up Wallet Now</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">24/7 HR Service VPS Hosting Platform</p>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'INSUFFICIENT_BALANCE',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `Renewal amount: ₹${renewalAmount}, Balance: ₹${currentBalance}, Shortfall: ₹${shortfall}`,
        metadata: { renewalAmount, currentBalance, shortfall, today: todayStr },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyVpsSuspended(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null },
    gracePeriodExpiresAt: Date,
  ) {
    const graceEndStr = gracePeriodExpiresAt.toISOString().slice(0, 10);
    const idempotencyKey = `notif-vps-suspended:${vps.id}:${graceEndStr}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const subject = `🛑 Service Suspended: VPS (${vps.ipAddress}) has entered Grace Period`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #b91c1c;">VPS Instance Suspended</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>Your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) has expired and has been <strong>suspended</strong>.</p>
        <p>Your server is currently in the <strong>Grace Period</strong> until <strong>${graceEndStr}</strong>. During this grace period, your data remains intact, but the server is stopped.</p>
        <p style="color: #b91c1c; font-weight: bold;">WARNING: If the server is not renewed by ${graceEndStr}, it will be permanently terminated and all stored data will be erased.</p>
        <div style="margin: 25px 0;">
          <a href="/wallet" style="background-color: #b91c1c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reactivate / Renew Server</a>
        </div>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'VPS_SUSPENDED',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `VPS suspended. Grace period ends on ${graceEndStr}`,
        metadata: { gracePeriodExpiresAt: graceEndStr },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyGracePeriodEnding(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null },
    hoursRemaining: number,
  ) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `notif-grace-ending:${vps.id}:${todayStr}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const subject = `🚨 FINAL NOTICE: VPS (${vps.ipAddress}) facing permanent termination in ${hoursRemaining} hours`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #7f1d1d;">Final Grace Period Notice</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>This is your final warning. The grace period for your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) will expire in approximately <strong>${hoursRemaining} hours</strong>.</p>
        <p style="color: #dc2626; font-weight: bold;">Upon expiration of the grace period, the server and all associated disks will be permanently terminated.</p>
        <div style="margin: 25px 0;">
          <a href="/wallet" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Renew Now to Avoid Termination</a>
        </div>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'GRACE_PERIOD_WARNING',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `Final warning: ${hoursRemaining} hours remaining before termination`,
        metadata: { hoursRemaining, date: todayStr },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }

  async notifyVpsTerminated(
    user: { id: string; email: string; name?: string | null },
    vps: { id: string; ipAddress: string; hostname?: string | null },
  ) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `notif-vps-terminated:${vps.id}:${dateStr}`;

    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { sent: false, reason: 'ALREADY_SENT' };
    }

    const subject = `🗑️ Service Terminated: VPS (${vps.ipAddress}) has been terminated`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2 style="color: #4b5563;">VPS Terminated</h2>
        <p>Hello ${user.name || 'Customer'},</p>
        <p>Following the expiration of the grace period without renewal, your VPS instance <strong>${vps.hostname || vps.ipAddress}</strong> (${vps.ipAddress}) has been decommissioned and terminated in accordance with platform policy.</p>
        <p>If you wish to deploy a new server, you can order a new VPS plan anytime from your dashboard.</p>
        <div style="margin: 25px 0;">
          <a href="/windows-vps" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Deploy New VPS</a>
        </div>
      </div>
    `;

    await this.emailService.sendNotificationEmail(user.email, subject, html);

    const log = await this.prisma.notificationLog.create({
      data: {
        userId: user.id,
        vpsId: vps.id,
        type: 'VPS_TERMINATED',
        channel: 'EMAIL',
        recipient: user.email,
        subject,
        content: `VPS instance terminated after grace period expiration on ${dateStr}`,
        metadata: { date: dateStr },
        idempotencyKey,
      },
    });

    return { sent: true, log };
  }
}
