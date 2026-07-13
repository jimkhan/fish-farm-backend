import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DevicePlatform } from '../../domain/device-token.entity';

/** `RegisterDevice` schema (contracts/openapi.yaml, CON-045). */
export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty({ message: 'A device token is required.' })
  fcmToken!: string;

  @IsOptional()
  @IsIn(['ANDROID', 'WEB'])
  platform?: DevicePlatform;
}
