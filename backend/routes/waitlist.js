import express from 'express';
import Waitlist from '../models/Waitlist.js';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import env from '../config/env.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: env.email.user,
        pass: env.email.pass
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, email, company, role, phone, teamSize, message, type } = req.body;

        // 1. Save to MongoDB
        const newEntry = new Waitlist({
            name,
            email,
            company,
            role,
            phone,
            teamSize,
            message,
            type: type || 'individual'
        });
        await newEntry.save();

        // 2. Append to Excel
        const excelPath = path.join(__dirname, '../../waitlist.xlsx');
        const workbook = new ExcelJS.Workbook();
        let worksheet;

        if (fs.existsSync(excelPath)) {
            await workbook.xlsx.readFile(excelPath);
            worksheet = workbook.getWorksheet('Waitlist');
        } else {
            worksheet = workbook.addWorksheet('Waitlist');
            worksheet.columns = [
                { header: 'Date', key: 'date', width: 20 },
                { header: 'Type', key: 'type', width: 15 },
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Company', key: 'company', width: 20 },
                { header: 'Role', key: 'role', width: 20 },
                { header: 'Phone', key: 'phone', width: 15 },
                { header: 'Team Size', key: 'teamSize', width: 15 },
                { header: 'Message', key: 'message', width: 40 }
            ];
            // Style the header row
            worksheet.getRow(1).font = { bold: true };
        }

        worksheet.addRow({
            date: new Date().toLocaleString(),
            type: type || 'individual',
            name,
            email,
            company: company || '-',
            role: role || '-',
            phone: phone || '-',
            teamSize: teamSize || '-',
            message: message || '-'
        });

        await workbook.xlsx.writeFile(excelPath);

        // 3. Send Confirmation Email to User
        const userMailOptions = {
            from: `"Mantram AI" <${env.email.user}>`,
            to: email,
            subject: 'You are on the list! Welcome to Mantram AI ✨',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2 style="color: #6366f1;">Hi ${name.split(' ')[0]},</h2>
                    <p>Thank you for requesting early access to <strong>Mantram AI</strong>!</p>
                    <p>Your spot on the waitlist has been secured. We are rolling out access in batches to ensure the best possible experience for our users.</p>
                    <p>We're building an entirely new way to handle marketing with AI agents, and we can't wait for you to try it.</p>
                    <p>Keep an eye on your inbox—we'll notify you as soon as your workspace is ready.</p>
                    <br>
                    <p>Best regards,</p>
                    <p><strong>The Mantram AI Team</strong></p>
                </div>
            `
        };

        // 4. Send Notification Email to Team
        const teamMailOptions = {
            from: `"Mantram AI Waitlist" <${env.email.user}>`,
            to: env.email.user, // Send to damantram.ai@gmail.com
            subject: `🎉 New Waitlist Sign-up: ${name} (${type})`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <h2>New Waitlist Submission! 🚀</h2>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${type || 'individual'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Company:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${company || '-'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Role:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${role || '-'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${phone || '-'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Team Size:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${teamSize || '-'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Message:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${message || '-'}</td></tr>
                    </table>
                </div>
            `
        };

        // Send both emails asynchronously (don't block the response if they fail)
        transporter.sendMail(userMailOptions).catch(err => console.error('Error sending user email:', err));
        transporter.sendMail(teamMailOptions).catch(err => console.error('Error sending team email:', err));

        res.status(200).json({ success: true, message: 'Successfully added to waitlist' });
    } catch (error) {
        console.error('Waitlist submission error:', error);
        res.status(500).json({ success: false, message: 'Server error processing your request. Please try again.' });
    }
});

export default router;
