import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('devices')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.notificationsService.registerDevice(user.userId, dto.token, dto.platform);
  }

  @Delete('devices/:token')
  unregister(@Param('token') token: string) {
    return this.notificationsService.unregisterDevice(token);
  }
}
