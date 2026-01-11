import { Module } from '@nestjs/common';
import {
  ShareController,
  WhatsAppController,
  BusinessWhatsAppController,
} from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  controllers: [
    ShareController,
    WhatsAppController,
    BusinessWhatsAppController,
  ],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
